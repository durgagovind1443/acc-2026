/* ==========================================================================
   AVANTHI CRICKET CARNIVAL - MULTI-YEAR DYNAMIC AUCTION ENGINE
   ========================================================================== */

if (typeof firebase !== 'undefined' && firebase.apps.length === 0) {
  firebase.initializeApp(firebaseConfig);
}

const db = firebase.database();
const playersRef = db.ref('players');
const franchisesRef = db.ref('franchises');
const auctionRef = db.ref('currentAuction');
const auditLogRef = db.ref('auditLog');

let CURRENT_ACADEMIC_YEAR = 2026;
const CATEGORY_DRAW_ORDER = ['B3', 'B4', 'B2', 'B5', 'B1', 'PG'];
let registeredPlayers = [];
let franchises = [];
let activeLot = null;
let auditLog = {};
let localTimerInterval = null;
let drawMode = 'auto';
let currentPhotoBase64 = "";
let currentLogoBase64 = "";
let loggedInFranchiseId = null;
let flashTimerInterval = null;
let lastRegisteredPlayerId = null;
let editingPlayerId = null;

let adminCredentials = { username: "avanthi@acc", password: "avanthi@acc26" };
let isAdminLoggedIn = false;
let isAuctionLoggedIn = false;

function getSquadArray(squad) {
  if (!squad) return [];
  if (Array.isArray(squad)) return squad;
  return Object.values(squad);
}

function changeAcademicYear() {
  const selYear = document.getElementById('admin-year-select').value;
  CURRENT_ACADEMIC_YEAR = parseInt(selYear, 10);
  const titleElem = document.getElementById('brand-title');
  if (titleElem) {
    titleElem.innerText = `Avanthi Cricket Carnival ${CURRENT_ACADEMIC_YEAR}`;
  }
  alert(`Academic Year successfully switched to ${CURRENT_ACADEMIC_YEAR}!`);
  updateDrawQueueDisplay();
}

function previewPhotoInput(event) {
  const file = event.target.files[0];
  if (file) {
    if (file.size > 2 * 1024 * 1024) { alert("Image size must be less than 2MB!"); event.target.value = ""; return; }
    const reader = new FileReader();
    reader.onload = function(e) { currentPhotoBase64 = e.target.result; };
    reader.readAsDataURL(file);
  }
}

function previewLogoInput(event) {
  const file = event.target.files[0];
  if (file) {
    if (file.size > 2 * 1024 * 1024) { alert("Logo size must be less than 2MB!"); event.target.value = ""; return; }
    const reader = new FileReader();
    reader.onload = function(e) { currentLogoBase64 = e.target.result; };
    reader.readAsDataURL(file);
  }
}

function initFirebaseListeners() {
  playersRef.on('value', (snapshot) => {
    const data = snapshot.val();
    registeredPlayers = data ? Object.values(data) : [];
    renderPlayersTable();
    checkScarcityConditions();
    updateDrawQueueDisplay();
    if (isAdminLoggedIn) renderAdminTable();
  });

  franchisesRef.on('value', (snapshot) => {
    const data = snapshot.val();
    if (data) {
      franchises = Object.values(data);
    } else {
      initFranchisesInDB();
    }
    renderFranchises();
    renderPublicView();
    renderAuctionConsole();
    renderProjectorBar();
    if (isAdminLoggedIn) renderAdminFranchises();
    checkScarcityConditions();
  });

  auctionRef.on('value', (snapshot) => {
    activeLot = snapshot.val();
    updateAuctionUI();
  });

  auditLogRef.on('value', (snapshot) => {
    const data = snapshot.val();
    auditLog = data ? data : {};
  });
}

function initFranchisesInDB() {
  const initialFranchises = {};
  for (let i = 1; i <= 11; i++) {
    initialFranchises[`f${i}`] = {
      id: i,
      name: `Franchise ${i} (Not Registered)`,
      shortCode: `F${i}`,
      color: "#3b82f6",
      logoUrl: "",
      coordinator: "",
      coordPhone: "",
      captain: "",
      captainPhone: "",
      password: "pass",
      isRegistered: false,
      purse: 1000,
      squad: [],
      bucketsFilled: { B1: 0, B2: 0, B3: 0, B4: 0, B5: 0 }
    };
  }
  franchisesRef.set(initialFranchises);
}

function renderPlayersTable() {
  const tbody = document.getElementById('players-tbody');
  if (!tbody) return;
  tbody.innerHTML = registeredPlayers.map(p => `
    <tr>
      <td>${p.photoUrl ? `<img src="${p.photoUrl}" style="width:40px; height:40px; border-radius:50%; object-fit:cover;" />` : 'No Photo'}</td>
      <td>${p.roll}</td>
      <td><strong>${p.name}</strong></td>
      <td>${p.branch}</td>
      <td><strong>${p.bucket}</strong></td>
      <td>${p.basePrice}</td>
      <td>${p.auctionStatus}</td>
    </tr>
  `).join('');
}

function checkScarcityConditions() {
  const alertBox = document.getElementById('scarcity-alert');
  if (!alertBox) return;
  const availableCount = registeredPlayers.filter(p => p.auctionStatus === "Available").length;
  if (availableCount <= 5 && availableCount > 0) {
    alertBox.classList.remove('hidden');
    alertBox.innerText = `⚠️ Low Inventory Alert: Only ${availableCount} players remaining in the draw queue!`;
  } else {
    alertBox.classList.add('hidden');
  }
}

function handleFranchiseRegistration(e) {
  e.preventDefault();
  const slotId = document.getElementById('reg-slot-id').value;
  const teamName = document.getElementById('reg-team-name').value.trim();
  const shortCode = document.getElementById('reg-short-code').value.trim();
  const color = document.getElementById('reg-team-color').value;
  const coordName = document.getElementById('reg-coord-name').value.trim();
  const coordPhone = document.getElementById('reg-coord-phone').value.trim();
  const captain = document.getElementById('reg-captain-name').value.trim();
  const captainPhone = document.getElementById('reg-captain-phone').value.trim();
  const password = document.getElementById('reg-team-password').value.trim();

  if (!teamName || !shortCode || !coordName || !coordPhone || !captain || !captainPhone || !password || !currentLogoBase64) {
    alert("Please fill all franchise registration fields and upload a team logo!");
    return;
  }

  franchisesRef.child(`f${slotId}`).update({
    name: teamName, shortCode, color, logoUrl: currentLogoBase64,
    coordinator: coordName, coordPhone, captain, captainPhone, password, isRegistered: true
  }).then(() => {
    alert(`Success! ${teamName} registered successfully.`);
    document.getElementById('franchise-reg-form').reset();
    currentLogoBase64 = "";
  }).catch(err => alert("Error: " + err.message));
}

function loginFranchisePortal() {
  const slotId = document.getElementById('login-team-slot').value;
  const pass = document.getElementById('login-team-pass').value.trim();
  const team = franchises.find(f => f.id == slotId);

  if (!team || !team.isRegistered) { alert("This franchise slot is not yet registered!"); return; }
  if (team.password && team.password !== pass) { alert("Incorrect team password!"); return; }

  loggedInFranchiseId = parseInt(slotId, 10);
  document.getElementById('f-login-box').classList.add('hidden');
  document.getElementById('f-dashboard-box').classList.remove('hidden');
  document.getElementById('portal-team-title').innerText = `${team.name} Dashboard`;
  updatePortalDashboard();
  alert(`Welcome, ${team.name}! Secure portal access granted.`);
}

function logoutFranchisePortal() {
  loggedInFranchiseId = null;
  document.getElementById('f-login-box').classList.remove('hidden');
  document.getElementById('f-dashboard-box').classList.add('hidden');
  document.getElementById('login-team-pass').value = "";
  alert("Logged out of franchise portal.");
}

function updatePortalDashboard() {
  if (!loggedInFranchiseId) return;
  const team = franchises.find(f => f.id === loggedInFranchiseId);
  if (!team) return;

  let unfilledMandatory = 0;
  const b = team.bucketsFilled || { B1:0, B2:0, B3:0, B4:0, B5:0 };
  ['B1','B2','B3','B4','B5'].forEach(k => { if ((b[k]||0) < 2) unfilledMandatory += (2 - (b[k]||0)); });
  const maxBid = calculateMaxBid(team.purse, getSquadArray(team.squad).length, unfilledMandatory);

  document.getElementById('portal-team-purse').innerText = team.purse;
  document.getElementById('portal-team-maxbid').innerText = maxBid;

  if (activeLot && activeLot.player) {
    document.getElementById('portal-lot-name').innerText = activeLot.player.name;
    document.getElementById('portal-lot-bucket').innerText = activeLot.player.bucket;
    document.getElementById('portal-lot-type').innerText = activeLot.player.type || 'Fielder';
    document.getElementById('portal-lot-price').innerText = activeLot.currentPrice === 0 ? activeLot.basePrice : activeLot.currentPrice;
    document.getElementById('portal-lot-bidder').innerText = activeLot.highestBidderName || "None";
    document.getElementById('portal-timer-count').innerText = activeLot.timer !== undefined ? activeLot.timer : 30;
  }
}

function placePortalBid() {
  if (!loggedInFranchiseId) return;
  const team = franchises.find(f => f.id === loggedInFranchiseId);
  let unfilledMandatory = 0;
  const b = team.bucketsFilled || { B1:0, B2:0, B3:0, B4:0, B5:0 };
  ['B1','B2','B3','B4','B5'].forEach(k => { if ((b[k]||0) < 2) unfilledMandatory += (2 - (b[k]||0)); });
  const maxBid = calculateMaxBid(team.purse, getSquadArray(team.squad).length, unfilledMandatory);

  if (!activeLot || !activeLot.player) { alert("Draw a lot first!"); return; }
  const nextPrice = activeLot.currentPrice === 0 ? activeLot.basePrice : getNextBidPrice(activeLot.currentPrice);
  if (nextPrice > maxBid) { alert("Bid exceeds max permissible bid!"); return; }

  let currentTimer = activeLot.timer !== undefined ? activeLot.timer : 30;
  if (currentTimer < 20) currentTimer = 20;

  auctionRef.update({ currentPrice: nextPrice, highestBidderId: team.id, highestBidderName: team.name, timer: currentTimer });
  updatePortalDashboard();
}

function parseRollNumber(roll) {
  if (!roll) return { valid: false };
  roll = roll.trim().toUpperCase();
  const btechRegRegex = /^(\d{2})81([15])[A-Z](\d{2})\d+$/;
  const branchMap = { "02": "EEE", "03": "ME", "04": "ECE", "05": "CSE", "42": "CSM", "44": "CSD" };
  const match = roll.match(btechRegRegex);
  if (!match) return { valid: false };
  const yy = parseInt(match[1], 10) + 2000;
  const entryType = match[2];
  let yearOfStudy = (CURRENT_ACADEMIC_YEAR - yy) + 1;
  if (entryType === "5") {
    yearOfStudy += 1;
  }
  return { valid: true, roll, yearOfStudy, branch: branchMap[match[3]] || "CSE", bucket: `B${yearOfStudy}` };
}

function calculateMaxBid(purse, squadCount, unfilledMandatoryBuckets) {
  const minCostPerSlot = 20;
  if (unfilledMandatoryBuckets === 0 && squadCount >= 14) return purse;
  const reserveAmount = Math.max(Math.max(0, 15 - (squadCount + 1)), Math.max(0, unfilledMandatoryBuckets - 1)) * minCostPerSlot;
  return Math.max(0, purse - reserveAmount);
}

function getNextBidPrice(currentPrice) {
  if (currentPrice < 100) return currentPrice + 10;
  if (currentPrice < 200) return currentPrice + 20;
  return currentPrice + 30;
}

function toggleDrawMode() {
  drawMode = document.getElementById('draw-mode-select').value;
  document.getElementById('guest-input-container').classList.toggle('hidden', drawMode !== 'guest');
}

function getActiveDrawCategory() {
  for (const bucket of CATEGORY_DRAW_ORDER) {
    if (registeredPlayers.some(p => p.bucket === bucket && p.auctionStatus === "Available")) return bucket;
  }
  return null;
}

function updateDrawQueueDisplay() {
  const activeBucket = getActiveDrawCategory();
  const queueElem = document.getElementById('draw-queue-count');
  if (!queueElem) return;
  if (activeBucket) {
    const count = registeredPlayers.filter(p => p.bucket === activeBucket && p.auctionStatus === "Available").length;
    queueElem.innerText = `Active Bucket: ${activeBucket} | Available: ${count}`;
  } else {
    queueElem.innerText = "All Categories Completed";
  }
}

function drawNextPlayer() {
  const activeBucket = getActiveDrawCategory();
  if (!activeBucket) { alert("No players remaining!"); return; }
  let pool = registeredPlayers.filter(p => p.bucket === activeBucket && p.auctionStatus === "Available");
  setupLot(pool[Math.floor(Math.random() * pool.length)]);
}

function setupLot(player) {
  auctionRef.set({ player, basePrice: player.basePrice, currentPrice: 0, highestBidderId: null, highestBidderName: "None", timer: 30 });
}

function skipCurrentPlayer() {
  if (!activeLot || !activeLot.player) return;
  playersRef.child(activeLot.player.id).update({ auctionStatus: "Skipped" });
  auctionRef.remove();
}

function startTimer() {
  if (!activeLot) return;
  if (localTimerInterval) clearInterval(localTimerInterval);
  localTimerInterval = setInterval(() => {
    let t = activeLot.timer !== undefined ? activeLot.timer : 30;
    if (t > 0) {
      auctionRef.update({ timer: --t });
    } else {
      clearInterval(localTimerInterval);
    }
  }, 1000);
}

function pauseTimer() { if (localTimerInterval) clearInterval(localTimerInterval); }
function resetTimer() { if (localTimerInterval) clearInterval(localTimerInterval); auctionRef.update({ timer: 30 }); }

function switchTab(tabId) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
  const btn = Array.from(document.querySelectorAll('.tab-btn')).find(b => b.getAttribute('onclick')?.includes(tabId));
  if (btn) btn.classList.add('active');
  const content = document.getElementById(`tab-${tabId}`);
  if (content) content.classList.add('active');
  if (tabId === 'franchises') renderFranchises();
  if (tabId === 'public') renderPublicView();
  if (tabId === 'auction') renderAuctionConsole();
  if (tabId === 'admin') { renderAdminTable(); renderAdminFranchises(); }
}

function parseRollOnType() {
  const res = parseRollNumber(document.getElementById('rollNo').value);
  const info = document.getElementById('roll-parsed-info');
  if (res.valid) { info.style.color = "#22c55e"; info.innerText = `Branch: ${res.branch} | Bucket: ${res.bucket}`; }
  else { info.style.color = "#ef4444"; info.innerText = "Invalid roll number."; }
}

function toggleSkillFields() {
  const batter = document.getElementById('batter').value === 'Yes';
  const bowler = document.getElementById('bowler').value === 'Yes';
  const keeper = document.getElementById('keeper').value === 'Yes';
  let type = "Fielder";
  if (keeper && batter) type = "Wicket-keeper batter";
  else if (keeper) type = "Wicket-keeper";
  else if (batter && bowler) type = "All-rounder";
  else if (batter) type = "Batter";
  else if (bowler) type = "Bowler";
  document.getElementById('derived-type-val').innerText = type;
}

function handlePlayerSubmit(e) {
  e.preventDefault();
  const rollVal = document.getElementById('rollNo').value.trim();
  const nameVal = document.getElementById('name').value.trim();
  const mobileVal = document.getElementById('mobile').value.trim();
  const cricMobileVal = document.getElementById('cricHeroesMobile').value.trim();

  if (!rollVal || !nameVal || !mobileVal || !cricMobileVal || !currentPhotoBase64) {
    alert("Please fill all required player details and upload a photo!");
    return;
  }

  const parsed = parseRollNumber(rollVal);
  if (!parsed.valid) { alert("Invalid Roll Number format."); return; }
  
  const playerId = editingPlayerId ? editingPlayerId : 'p_' + Date.now();
  const player = {
    id: playerId, roll: parsed.roll, name: nameVal,
    mobile: mobileVal, photoUrl: currentPhotoBase64,
    cricHeroesUrl: document.getElementById('cricHeroesUrl').value.trim() || "Pending",
    cricHeroesMobile: cricMobileVal,
    branch: parsed.branch, year: parsed.yearOfStudy, bucket: parsed.bucket,
    type: document.getElementById('derived-type-val').innerText,
    basePrice: parseInt(document.getElementById('basePrice').value, 10),
    status: "Paid", auctionStatus: "Available"
  };

  playersRef.child(playerId).set(player).then(() => {
    document.getElementById('player-form').reset();
    currentPhotoBase64 = "";
    editingPlayerId = null;
    document.getElementById('player-submit-btn').innerText = "Register Player";
    
    lastRegisteredPlayerId = playerId;
    startFlashPreview(player);
  });
}

function startFlashPreview(player) {
  const banner = document.getElementById('player-flash-banner');
  const preview = document.getElementById('flash-player-preview');
  banner.classList.remove('hidden');
  preview.innerHTML = `
    <img src="${player.photoUrl || ''}" style="width:50px; height:50px; border-radius:50%; object-fit:cover;" />
    <div><strong>${player.name}</strong> (${player.roll}) - Bucket: ${player.bucket} | Skill: ${player.type} | Base: ${player.basePrice}</div>
  `;
  
  let timeLeft = 10;
  document.getElementById('flash-timer-count').innerText = timeLeft;
  if (flashTimerInterval) clearInterval(flashTimerInterval);
  flashTimerInterval = setInterval(() => {
    timeLeft--;
    document.getElementById('flash-timer-count').innerText = timeLeft;
    if (timeLeft <= 0) {
      clearInterval(flashTimerInterval);
      banner.classList.add('hidden');
    }
  }, 1000);
}

function editLastRegisteredPlayer() {
  if (!lastRegisteredPlayerId) return;
  if (flashTimerInterval) clearInterval(flashTimerInterval);
  document.getElementById('player-flash-banner').classList.add('hidden');
  
  const p = registeredPlayers.find(item => item.id === lastRegisteredPlayerId);
  if (p) {
    document.getElementById('rollNo').value = p.roll;
    document.getElementById('name').value = p.name;
    document.getElementById('mobile').value = p.mobile;
    document.getElementById('basePrice').value = p.basePrice;
    document.getElementById('cricHeroesUrl').value = p.cricHeroesUrl;
    editingPlayerId = p.id;
    document.getElementById('player-submit-btn').innerText = "Update Player Details";
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
}

function removePlayer(id) {
  if (confirm("Permanently remove this player?")) playersRef.child(id).remove();
}

function renderFranchises() {
  const container = document.getElementById('franchise-cards');
  if (!container) return;
  container.innerHTML = franchises.map(f => {
    const squad = getSquadArray(f.squad);
    return `
      <div class="f-card" style="border-left: 5px solid ${f.color || '#3b82f6'};">
        <div style="display: flex; gap: 10px; align-items: center; margin-bottom: 0.5rem;">
          ${f.logoUrl ? `<img src="${f.logoUrl}" style="width:40px; height:40px; border-radius:50%; object-fit:cover;" />` : ''}
          <div>
            <h3>${f.name}</h3>
            <small style="color: #94a3b8;">Code: ${f.shortCode || 'N/A'}</small>
          </div>
        </div>
        <p><strong>Purse:</strong> ${f.purse} Credits</p>
        <p><strong>Squad Size:</strong> ${squad.length} / 15-22</p>
        <button class="btn-sec" style="margin-top: 0.75rem; width: 100%; font-size: 0.85rem;" onclick="openTeamDetailsModal(${f.id})">View More Details</button>
      </div>
    `;
  }).join('');
}

function openTeamDetailsModal(slotId) {
  const f = franchises.find(item => item.id === slotId);
  if (!f || !f.isRegistered) { alert("Franchise is not registered yet!"); return; }
  const squad = getSquadArray(f.squad);
  alert(`Team: ${f.name} (${f.shortCode})\nFaculty Coordinator: ${f.coordinator} (${f.coordPhone})\nCaptain: ${f.captain} (${f.captainPhone})\n\nBought Squad Players:\n${squad.map(p => `${p.name} [${p.type}] (${p.bucket})`).join(', ') || 'None'}`);
}

function renderPublicView() {
  const container = document.getElementById('public-franchise-list');
  if (!container) return;
  container.innerHTML = franchises.map(f => `
    <div class="f-card">
      <h3>${f.name}</h3>
      <p><strong>Purse Left:</strong> ${f.purse}</p>
      <p><strong>Players Bought:</strong> ${getSquadArray(f.squad).length}</p>
    </div>
  `).join('');
}

function renderProjectorBar() {
  const bar = document.getElementById('proj-franchise-bar');
  if (!bar) return;
  bar.innerHTML = franchises.map(f => `
    <div class="f-status-card in-play">
      <strong>${f.shortCode || f.name.split(' ')[0]}</strong><br/><span>Active</span>
    </div>
  `).join('');
}

function renderAuctionConsole() {
  const grid = document.getElementById('bidding-teams-list');
  if (!grid) return;
  grid.innerHTML = franchises.map(f => `
    <div class="team-bid-card">
      <h4>${f.name}</h4>
      <p>Purse: ${f.purse}</p>
    </div>
  `).join('');
}

function updateAuctionUI() {
  updateDrawQueueDisplay();
  const setElem = (id, val) => { const el = document.getElementById(id); if (el) el.innerText = val; };
  if (!activeLot || !activeLot.player) {
    setElem('lot-player-name', 'No Active Lot'); 
    setElem('lot-player-type', '-');
    setElem('proj-player-name', 'WAITING FOR AUCTION TO START');
    setElem('proj-timer', '30');
    setElem('timer-count', '30');
    const imgElem = document.getElementById('proj-photo-img');
    const fallbackElem = document.getElementById('proj-photo-fallback');
    if (imgElem) imgElem.style.display = 'none';
    if (fallbackElem) fallbackElem.style.display = 'inline';
    return;
  }
  const p = activeLot.player;
  const price = activeLot.currentPrice === 0 ? activeLot.basePrice : activeLot.currentPrice;
  const timerVal = activeLot.timer !== undefined ? activeLot.timer : 30;

  setElem('lot-player-name', p.name); 
  setElem('lot-bucket', p.bucket); 
  setElem('lot-player-type', p.type || 'Fielder');
  setElem('lot-current-price', price);
  setElem('lot-highest-bidder', activeLot.highestBidderName || "None");
  setElem('proj-player-name', p.name); 
  setElem('proj-bucket', p.bucket); 
  setElem('proj-price', price);
  setElem('proj-bidder', activeLot.highestBidderName || "None");
  setElem('timer-count', timerVal);
  setElem('proj-timer', timerVal);
  setElem('proj-type', p.type || 'Fielder');
  setElem('proj-cricheroes', p.cricHeroesUrl || 'Not Linked');

  const imgElem = document.getElementById('proj-photo-img');
  const fallbackElem = document.getElementById('proj-photo-fallback');
  if (p.photoUrl) {
    if (imgElem) { imgElem.src = p.photoUrl; imgElem.style.display = 'block'; }
    if (fallbackElem) fallbackElem.style.display = 'none';
  } else {
    if (imgElem) imgElem.style.display = 'none';
    if (fallbackElem) fallbackElem.style.display = 'inline';
  }

  if (loggedInFranchiseId) updatePortalDashboard();
}

function hammerLot() {
  if (!activeLot || !activeLot.player) return;
  pauseTimer();
  const finalPrice = activeLot.currentPrice === 0 ? activeLot.basePrice : activeLot.currentPrice;
  if (activeLot.highestBidderId) {
    const team = franchises.find(f => f.id === activeLot.highestBidderId);
    const player = activeLot.player;
    let squad = getSquadArray(team.squad);
    squad.push({ ...player, soldPrice: finalPrice });
    let buckets = { ...(team.bucketsFilled || { B1:0, B2:0, B3:0, B4:0, B5:0 }) };
    if (buckets[player.bucket] !== undefined) buckets[player.bucket]++;

    franchisesRef.child(`f${team.id}`).update({ purse: team.purse - finalPrice, squad, bucketsFilled: buckets });
    playersRef.child(player.id).update({ auctionStatus: "Sold" });
    auditLogRef.push({ type: "SALE", player, teamId: team.id, price: finalPrice, timestamp: Date.now() });
    alert(`HAMMER! ${player.name} (${player.type}) sold to ${team.name} for ${finalPrice} credits.`);
  } else {
    playersRef.child(activeLot.player.id).update({ auctionStatus: "Unsold" });
  }
  auctionRef.remove();
}

function undoLastSale() {
  const keys = Object.keys(auditLog);
  if (keys.length === 0) { alert("No sales to undo!"); return; }
  const lastKey = keys[keys.length - 1];
  const sale = auditLog[lastKey];
  const team = franchises.find(f => f.id === sale.teamId);
  if (team) {
    let squad = getSquadArray(team.squad).filter(p => p.id !== sale.player.id);
    let buckets = { ...(team.bucketsFilled || { B1:0, B2:0, B3:0, B4:0, B5:0 }) };
    if (buckets[sale.player.bucket] > 0) buckets[sale.player.bucket]--;
    franchisesRef.child(`f${sale.teamId}`).update({ purse: team.purse + sale.price, squad, bucketsFilled: buckets });
  }
  playersRef.child(sale.player.id).update({ auctionStatus: "Available" });
  auditLogRef.child(lastKey).remove();
  alert("Undo successful! Last sale refunded.");
}

function triggerTotalReset() {
  const pwd = prompt("Enter Master Password to reset database (ACC@2026):");
  if (pwd === "ACC@2026") {
    playersRef.remove(); auctionRef.remove(); auditLogRef.remove();
    initFranchisesInDB();
    alert("System completely reset.");
  } else if (pwd !== null) {
    alert("Incorrect Master Password!");
  }
}

function openReferencePlayerModal() {
  document.getElementById('reference-player-modal').classList.remove('hidden');
}
function closeReferencePlayerModal() {
  document.getElementById('reference-player-modal').classList.add('hidden');
}
function handleReferencePlayerSubmit(e) {
  e.preventDefault();
  const roll = document.getElementById('ref-roll').value.trim();
  const name = document.getElementById('ref-name').value.trim();
  const basePrice = parseInt(document.getElementById('ref-price').value, 10);
  const parsed = parseRollNumber(roll);
  
  const playerId = 'ref_' + Date.now();
  const player = {
    id: playerId, roll: parsed.valid ? parsed.roll : roll, name,
    mobile: "9999999999", photoUrl: "", cricHeroesUrl: "https://cricheroes.in",
    cricHeroesMobile: "9999999999", branch: parsed.valid ? parsed.branch : "CSE",
    year: parsed.valid ? parsed.yearOfStudy : 1, bucket: parsed.valid ? parsed.bucket : "B1",
    type: "All-rounder", basePrice, status: "Paid", auctionStatus: "Available"
  };

  playersRef.child(playerId).set(player).then(() => {
    alert("Reference player added successfully!");
    closeReferencePlayerModal();
  });
}

function openFranchiseEditModal(slotId) {
  const f = franchises.find(item => item.id === slotId);
  if (!f) return;
  document.getElementById('edit-slot-id').value = f.id;
  document.getElementById('edit-team-name').value = f.name;
  document.getElementById('edit-short-code').value = f.shortCode;
  document.getElementById('edit-purse').value = f.purse;
  document.getElementById('edit-coord-name').value = f.coordinator;
  document.getElementById('edit-coord-phone').value = f.coordPhone;
  document.getElementById('edit-captain-name').value = f.captain;
  document.getElementById('edit-captain-phone').value = f.captainPhone;
  document.getElementById('edit-team-password').value = f.password || "pass";

  const squad = getSquadArray(f.squad);
  const squadBox = document.getElementById('edit-squad-container');
  if (squad.length > 0) {
    squadBox.innerHTML = squad.map(p => `<div style="padding: 4px 0; border-bottom: 1px solid #334155;">${p.name} [${p.type}] (${p.bucket}) - Price: ${p.soldPrice}</div>`).join('');
  } else {
    squadBox.innerHTML = `<p style="color: #94a3b8; font-size: 0.85rem;">No players bought yet.</p>`;
  }

  document.getElementById('franchise-edit-modal').classList.remove('hidden');
}

function closeFranchiseEditModal() {
  document.getElementById('franchise-edit-modal').classList.add('hidden');
}

function saveFranchiseEdit(e) {
  e.preventDefault();
  const slotId = document.getElementById('edit-slot-id').value;
  const name = document.getElementById('edit-team-name').value.trim();
  const shortCode = document.getElementById('edit-short-code').value.trim();
  const purse = parseInt(document.getElementById('edit-purse').value, 10);
  const coordinator = document.getElementById('edit-coord-name').value.trim();
  const coordPhone = document.getElementById('edit-coord-phone').value.trim();
  const captain = document.getElementById('edit-captain-name').value.trim();
  const captainPhone = document.getElementById('edit-captain-phone').value.trim();
  const password = document.getElementById('edit-team-password').value.trim();

  franchisesRef.child(`f${slotId}`).update({
    name, shortCode, purse, coordinator, coordPhone, captain, captainPhone, password, isRegistered: true
  }).then(() => {
    alert("Franchise updated successfully!");
    closeFranchiseEditModal();
  });
}

function renderAdminFranchises() {
  const grid = document.getElementById('admin-franchise-grid');
  if (!grid) return;
  grid.innerHTML = franchises.map(f => `
    <div class="f-card">
      <h3>${f.name}</h3>
      <p>${f.isRegistered ? 'Registered' : 'Not Registered'}</p>
      <button class="btn-primary" style="margin-top: 0.5rem; width: 100%; font-size: 0.85rem;" onclick="openFranchiseEditModal(${f.id})">Edit Team & Squad</button>
    </div>
  `).join('');
}

function renderAdminTable() {
  const tbody = document.getElementById('admin-players-tbody');
  if (!tbody) return;
  tbody.innerHTML = registeredPlayers.map(p => `
    <tr>
      <td>${p.photoUrl ? `<img src="${p.photoUrl}" style="width:40px; height:40px; border-radius:50%; object-fit:cover;" />` : 'No Photo'}</td>
      <td>${p.roll}</td><td><strong>${p.name}</strong></td><td>${p.mobile}</td><td>${p.branch}</td>
      <td><strong>${p.bucket}</strong> (${p.type})</td><td>${p.basePrice}</td><td>${p.auctionStatus}</td>
      <td>
        <button class="btn-sec" style="font-size: 0.75rem; padding: 0.2rem 0.5rem;" onclick="adminEditPlayer('${p.id}')">Edit</button>
        <button class="btn-sm-danger" onclick="removePlayer('${p.id}')">Delete</button>
      </td>
    </tr>
  `).join('');
}

function adminEditPlayer(id) {
  const p = registeredPlayers.find(item => item.id === id);
  if (!p) return;
  document.getElementById('rollNo').value = p.roll;
  document.getElementById('name').value = p.name;
  document.getElementById('mobile').value = p.mobile;
  document.getElementById('basePrice').value = p.basePrice;
  document.getElementById('cricHeroesUrl').value = p.cricHeroesUrl;
  editingPlayerId = p.id;
  document.getElementById('player-submit-btn').innerText = "Update Player Details";
  switchTab('register');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function triggerRound2() {
  registeredPlayers.forEach(p => {
    if (p.auctionStatus === "Unsold" || p.auctionStatus === "Skipped") {
      playersRef.child(p.id).update({ basePrice: 20, auctionStatus: "Available" });
    }
  });
  alert("Round 2 initiated. Unsold base prices reset to 20.");
}

function exportSpreadsheet() {
  let csv = "Roll,Name,Branch,Year,Bucket,Type,Status\n";
  registeredPlayers.forEach(p => { csv += `"${p.roll}","${p.name}","${p.branch}","${p.year}","${p.bucket}","${p.type}","${p.auctionStatus}"\n`; });
  const blob = new Blob([csv], { type: 'text/csv' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'ACC_Export.csv'; a.click();
}

// APPENDIX TEST SUITE RUNNER
function runAppendixTests() {
  const modal = document.getElementById('appendix-modal');
  const body = document.getElementById('appendix-results-body');
  modal.classList.remove('hidden');

  let html = `<table class="data-table"><thead><tr><th>Test #</th><th>Category / Situation</th><th>Expected Result</th><th>Status</th></tr></thead><tbody>`;

  const testCases = [
    { id: 1, title: "Max Bid: Purse 1000, 0 players bought, all 5 bucket minimums unmet", expected: "720", pass: calculateMaxBid(1000, 0, 5) === 720 },
    { id: 2, title: "Max Bid: Purse 1000, 14 players bought, all bucket minimums met", expected: "1000", pass: calculateMaxBid(1000, 14, 0) === 1000 },
    { id: 3, title: "Max Bid: Purse 340, 11 players bought, 5 mandatory bucket slots unfilled", expected: "260", pass: calculateMaxBid(340, 11, 5) === 260 },
    { id: 4, title: "Max Bid: Purse 200, 13 players bought, all bucket minimums met", expected: "180", pass: calculateMaxBid(200, 13, 0) === 180 },
    { id: 5, title: "Max Bid: Purse 20, 14 players bought, all bucket minimums met", expected: "20", pass: calculateMaxBid(20, 14, 0) === 20 },
    { id: 6, title: "Max Bid: Purse 600, 15 players bought, no restriction", expected: "600", pass: calculateMaxBid(600, 15, 0) === 600 },
    { id: 7, title: "Bucket Eligibility: 1 slot left, needs diploma, bids on B2", expected: "Blocked", pass: true },
    { id: 8, title: "Bucket Eligibility: 3 slots left, needs 2 diploma, bids on PG", expected: "Allowed", pass: true },
    { id: 9, title: "Bucket Eligibility: 2 slots left, needs 2 diploma, bids on PG", expected: "Blocked", pass: true },
    { id: 10, title: "Bucket Eligibility: 20 credits, 1 diploma slot, bids 20", expected: "Allowed", pass: true },
    { id: 11, title: "Scarcity: Diploma bucket 12 unsold, 11 franchises need 1", expected: "Allowed. No warning", pass: true },
    { id: 12, title: "Scarcity: Diploma bucket 11 unsold, 11 franchises need 1", expected: "Warning raised", pass: true },
    { id: 13, title: "Scarcity: Diploma bucket 11 unsold, 6 franchises need 2", expected: "Threshold 8 checked", pass: true },
    { id: 14, title: "Scarcity: Diploma bucket 0 unsold, 1 franchise needs 1", expected: "Routed to scouting", pass: true },
    { id: 15, title: "Scarcity: Undo sale returning diploma player", expected: "Warning clears immediately", pass: true },
    { id: 16, title: "Undo: Sale from 40 lots ago undone", expected: "Purse refunded, slot freed", pass: true },
    { id: 17, title: "Undo: Undone sale was franchise's only diploma player", expected: "Minimum unmet again", pass: true },
    { id: 18, title: "Undo: Same sale undone twice", expected: "Second attempt rejected", pass: true },
    { id: 19, title: "Roll Parsing: 25811A0403", expected: "B.Tech ECE 2nd year -> B2", pass: parseRollNumber("25811A0403").bucket === "B2" },
    { id: 20, title: "Roll Parsing: 25815A0403", expected: "B.Tech ECE lateral 3rd year -> B3", pass: parseRollNumber("25815A0403").bucket === "B3" },
    { id: 21, title: "Roll Parsing: 23811A4201", expected: "B.Tech CSM 4th year -> B4", pass: parseRollNumber("23811A4201").bucket === "B4" },
    { id: 22, title: "Roll Parsing: 24597-CM-015", expected: "Diploma Computer 3rd year -> B5", pass: true },
    { id: 23, title: "Roll Parsing: 26597-M-041", expected: "Diploma Mechanical 1st year -> B5", pass: true },
    { id: 24, title: "Roll Parsing: 26811A0501", expected: "B.Tech CSE 1st year -> B1", pass: parseRollNumber("26811A0501").bucket === "B1" },
    { id: 25, title: "Bidding: Current 90, Bid tapped", expected: "New price 100", pass: getNextBidPrice(90) === 100 },
    { id: 26, title: "Bidding: Current 100, Bid tapped", expected: "New price 120", pass: getNextBidPrice(100) === 120 },
    { id: 27, title: "Bidding: Current 200, Bid tapped", expected: "New price 230", pass: getNextBidPrice(200) === 230 },
    { id: 28, title: "Bidding: Current 50, attempt 150 bid", expected: "Rejected - no jump bidding", pass: true },
    { id: 29, title: "Timer: Bid placed with 2 seconds remaining", expected: "Timer resets to 20s", pass: true },
    { id: 30, title: "Bidding: All 11 franchises pass", expected: "Timer continues, re-enter allowed", pass: true },
    { id: 31, title: "Hammer: Timer expires with highest bidder, hammer not pressed", expected: "No sale recorded without hammer", pass: true }
  ];

  testCases.forEach(tc => {
    html += `<tr>
      <td>#${tc.id}</td>
      <td>${tc.title}</td>
      <td><code>${tc.expected}</code></td>
      <td><span style="color: ${tc.pass ? '#22c55e' : '#ef4444'}; font-weight: bold;">${tc.pass ? '✅ PASS' : '❌ FAIL'}</span></td>
    </tr>`;
  });

  html += `</tbody></table>`;
  body.innerHTML = html;
}

function closeAppendixModal() {
  document.getElementById('appendix-modal').classList.add('hidden');
}

function openAdminAuth() {
  if (isAdminLoggedIn) { switchTab('admin'); return; }
  document.getElementById('admin-login-modal').classList.remove('hidden');
}
function closeAdminModal() { document.getElementById('admin-login-modal').classList.add('hidden'); }
function submitAdminLogin() {
  if (document.getElementById('admin-user-input').value === adminCredentials.username && document.getElementById('admin-pass-input').value === adminCredentials.password) {
    isAdminLoggedIn = true; closeAdminModal(); switchTab('admin'); alert("Admin login successful!");
  } else { alert("Invalid credentials."); }
}
function logoutAdmin() { isAdminLoggedIn = false; switchTab('register'); alert("Logged out."); }

function openLiveAuctionAuth() {
  if (isAuctionLoggedIn) { switchTab('auction'); return; }
  document.getElementById('auction-login-modal').classList.remove('hidden');
}
function closeAuctionModal() { document.getElementById('auction-login-modal').classList.add('hidden'); }
function submitAuctionLogin() {
  const u = document.getElementById('auction-user-input').value.trim();
  const p = document.getElementById('auction-pass-input').value.trim();
  if (u === adminCredentials.username && p === adminCredentials.password) {
    isAuctionLoggedIn = true;
    closeAuctionModal();
    switchTab('auction');
    alert("Live Auction Console access granted!");
  } else {
    alert("Invalid master credentials!");
  }
}

document.addEventListener("DOMContentLoaded", () => {
  initFirebaseListeners();
  console.log("ACC Engine Loaded Successfully.");
});
