// test-tournaments.js
// Automated verification tests for the new Admin-Approved Score Tournaments feature

const fetch = require('node-fetch');

const BASE_URL = 'http://localhost:3000';

async function runTests() {
  console.log('🚀 Starting Automated Verification Tests for Tournaments Feature...\n');

  let adminToken = '';
  let userToken = '';

  try {
    // 0. Authenticate users
    console.log('0. Authenticating users...');
    // Log in admin
    const adminLoginRes = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'jordandaniels', password: '0422jojob' })
    });
    const adminLoginData = await adminLoginRes.json();
    if (!adminLoginData.token) {
      throw new Error(`Admin login failed: ${JSON.stringify(adminLoginData)}`);
    }
    adminToken = adminLoginData.token;
    console.log('   Admin jordandaniels authenticated successfully.');

    // Register/Login regular user
    const username = `testuser_${Date.now().toString().slice(-4)}`;
    const userRegRes = await fetch(`${BASE_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password: 'testpassword' })
    });
    const userRegData = await userRegRes.json();
    if (!userRegData.token) {
      throw new Error(`User registration failed: ${JSON.stringify(userRegData)}`);
    }
    userToken = userRegData.token;
    console.log(`   User @${username} registered and authenticated successfully.`);

    const adminHeaders = { 'Authorization': `Bearer ${adminToken}`, 'Content-Type': 'application/json' };
    const userHeaders = { 'Authorization': `Bearer ${userToken}`, 'Content-Type': 'application/json' };

    // Fetch a valid game ID
    const gamesRes = await fetch(`${BASE_URL}/api/games`);
    const gamesData = await gamesRes.json();
    const gameId = gamesData.games?.[0]?.id;
    if (!gameId) {
      throw new Error("No games found in catalog to link tournament to.");
    }
    console.log(`   Resolved valid game ID from catalog: ${gameId}`);

    let testTournamentId = null;
    let testSubmissionId = null;

    // 1. Fetching active tournaments initially
    console.log('\n1. Checking Active Tournaments (Initial)...');
    const getTourRes = await fetch(`${BASE_URL}/api/tournaments`);
    const getTourData = await getTourRes.json();
    console.log(`   Status: ${getTourRes.status} Active Tournaments Count: ${getTourData.tournaments?.length || 0}`);

    // 2. Admin creating a tournament
    console.log('\n2. Creating a Tournament (Admin)...');
    const createRes = await fetch(`${BASE_URL}/api/admin/tournaments`, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({
        gameId: gameId,
        title: 'Super Math Jam',
        description: 'Prove you are the math champion! Upload screenshot proof.',
        rewardCoins: 500,
        rewardXp: 1000,
        rewardFlair: 'Math Wizard',
        endAt: new Date(Date.now() + 3600000).toISOString() // 1 hour from now
      })
    });
    const createData = await createRes.json();
    console.log(`   Status: ${createRes.status} Success: ${createData.success}`);
    if (createData.success && createData.tournament) {
      testTournamentId = createData.tournament.id;
      console.log(`   Created Tournament ID: ${testTournamentId}`);
    } else {
      throw new Error(`Failed to create tournament: ${createData.error}`);
    }

    // 3. Regular user submitting a score
    console.log('\n3. Submitting a High Score (User)...');
    const submitRes = await fetch(`${BASE_URL}/api/tournaments/${testTournamentId}/submit`, {
      method: 'POST',
      headers: userHeaders,
      body: JSON.stringify({
        score: 15420,
        proofImageUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
      })
    });
    const submitData = await submitRes.json();
    console.log(`   Status: ${submitRes.status} Success: ${submitData.success} Message: ${submitData.message}`);
    if (submitData.success) {
      testSubmissionId = submitData.submissionId;
      console.log(`   Created Submission ID: ${testSubmissionId}`);
    } else {
      throw new Error(`Failed to submit score: ${submitData.error || submitData.message}`);
    }

    // 4. Admin fetching pending submissions
    console.log('\n4. Fetching Pending Submissions Queue (Admin)...');
    const pendingRes = await fetch(`${BASE_URL}/api/admin/tournaments/submissions`, {
      headers: adminHeaders
    });
    const pendingData = await pendingRes.json();
    const foundSub = (pendingData.submissions || []).find(s => s.id === testSubmissionId);
    console.log(`   Status: ${pendingRes.status} Found our pending submission in queue: ${!!foundSub}`);

    // 5. Admin approving the submission
    console.log('\n5. Approving Submission (Admin)...');
    const approveRes = await fetch(`${BASE_URL}/api/admin/tournaments/submissions/${testSubmissionId}/review`, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({
        decision: 'approved',
        adminNotes: 'Looks legit, score verified!'
      })
    });
    const approveData = await approveRes.json();
    console.log(`   Status: ${approveRes.status} Success: ${approveData.success} Result: ${approveData.submission?.status}`);

    // 6. Verifying leaderboard update
    console.log('\n6. Checking Leaderboard for Approved Score...');
    const leaderboardRes = await fetch(`${BASE_URL}/api/tournaments`);
    const leaderboardData = await leaderboardRes.json();
    const activeTour = (leaderboardData.tournaments || []).find(t => t.id === testTournamentId);
    const topScore = activeTour?.leaderboard?.[0];
    console.log(`   Tournament leaderboard count: ${activeTour?.leaderboard?.length || 0}`);
    if (topScore && topScore.username === username && topScore.score === 15420) {
      console.log(`   Leaderboard Verified! Top player is ${topScore.username} with score ${topScore.score}`);
    } else {
      throw new Error(`Leaderboard verification failed. Top score details: ${JSON.stringify(topScore)}`);
    }

    // 7. Closing the tournament
    console.log('\n7. Closing Tournament (Admin)...');
    const closeRes = await fetch(`${BASE_URL}/api/admin/tournaments/${testTournamentId}/close`, {
      method: 'POST',
      headers: adminHeaders
    });
    const closeData = await closeRes.json();
    console.log(`   Status: ${closeRes.status} Closed Tournament title: ${closeData.tournament?.title} Active: ${closeData.tournament?.is_active}`);

    console.log('\n======================================================');
    console.log('✅ ALL TOURNAMENT FEATURE VERIFICATION TESTS PASSED!');
    console.log('======================================================');
  } catch (err) {
    console.error('\n❌ VERIFICATION TEST FAILED:', err.message);
    process.exit(1);
  }
}

runTests();
