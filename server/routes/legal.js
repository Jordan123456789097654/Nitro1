const express = require('express');
const router = express.Router();

const LEGAL_EFFECTIVE = 'August 28, 2026';
const LEGAL_VERSION = '2.4.0';

const TERMS_TITLE = 'Terms of Service';
const PRIVACY_TITLE = 'Privacy Policy';
const DMCA_TITLE = 'DMCA / Copyright Policy';

const TERMS_BODY = `Last Updated / Effective Date: ${LEGAL_EFFECTIVE}
Document Version: ${LEGAL_VERSION}

IMPORTANT — PLEASE READ CAREFULLY

These Terms of Service (the "Terms" or "Agreement") form a legally binding contract between you, the user (hereinafter referred to as "User", "you", or "your"), and Nitro Games (hereinafter referred to as the "Company", "we", "us", or "our"). By accessing, browsing, registering for, or otherwise utilizing our web application, servers, games, proxies, embeds, and associated services (collectively, the "Service" or "Platform"), you represent and warrant that you have read, understood, and agreed to be bound by all of the provisions set forth herein. If you do not agree to these Terms in their entirety, you are strictly prohibited from utilizing the Platform and must cease all access immediately.

1. AGREEMENT TO TERMS
By accessing the Service, you agree that you are at least 13 years of age, or have obtained the express consent of your parent or legal guardian to access the Service. If you are under the age of majority in your jurisdiction, your parent or guardian must read and accept this Agreement on your behalf.

2. SERVICE DESCRIPTION AND MODIFICATIONS
The Company operates an online entertainment and utility hub, hosting various games, emulation engines, proxies, media-related systems, and communication widgets. We reserve the absolute, unilateral right to modify, suspend, terminate, or restrict access to the Platform, or any portion thereof, at any time, with or without notice, and without liability to you or any third party.

3. ELIGIBILITY AND ACCOUNT SECURITY
To access certain features of the Platform, you may be required to register for an account. You represent and warrant that all information provided during registration is accurate, current, and complete. You are solely responsible for maintaining the strict confidentiality of your account credentials, including your username, password, and two-factor authentication (2FA) tokens. You agree to assume full responsibility for all activities, actions, and conduct occurring under your account. The Company reserves the right, in its sole and absolute discretion, to terminate, disable, or suspend your account at any time for any reason, including but not limited to any breach of these Terms.

4. INTELLECTUAL PROPERTY RIGHTS AND LICENSING
All proprietary software, code, graphics, user interfaces, trademarks, logos, and patents featured on the Platform are the exclusive property of the Company or its licensors. Subject to your strict compliance with this Agreement, the Company grants you a limited, non-exclusive, non-transferable, revocable license to access and use the Platform for personal, non-commercial entertainment purposes. You shall not copy, modify, distribute, reverse-engineer, sell, or exploit any portion of our Platform without our prior, express written consent.

5. USER CONDUCT AND PROHIBITED ACTIVITIES
You agree that you will not engage in any conduct that violates local, state, federal, or international laws. Prohibited activities include, but are not limited to:
a) Deploying automated systems, spiders, scrapers, or bots to access or monitor the Platform;
b) Disrupting, overloading, or compromising the security, integrity, or network infrastructure of our servers;
c) Exploiting vulnerabilities, bypassing access barriers, or executing unauthorized privilege escalation;
d) Uploading malicious code, viruses, or Trojan horses;
e) Utilizing the Platform for harassment, spamming, or defamation.

6. DISCLAIMER OF WARRANTIES
THE PLATFORM IS PROVIDED ON AN "AS IS" AND "AS AVAILABLE" BASIS, WITHOUT WARRANTY OF ANY KIND, EXPRESS, IMPLIED, OR STATUTORY. TO THE MAXIMUM EXTENT PERMITTED BY LAW, THE COMPANY EXPLICITLY DISCLAIMS ALL WARRANTIES, INCLUDING BUT NOT LIMITED TO IMPLIED WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, TITLE, AND NON-INFRINGEMENT. WE DO NOT WARRANT THAT THE SERVICE WILL BE UNINTERRUPTED, SECURE, ACCURATE, CORRECTION-FREE, OR ENTIRELY FREE OF MALWARE.

7. LIMITATION OF LIABILITY
TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, IN NO EVENT SHALL THE COMPANY, ITS DIRECTORS, EMPLOYEES, OR AGENTS BE LIABLE FOR ANY INDIRECT, SPECIAL, INCIDENTAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, OR FOR LOSS OF PROFITS, REVENUE, DATA, OR USE, ARISING OUT OF OR IN CONNECTION WITH YOUR USE OR INABILITY TO USE THE PLATFORM, REGARDLESS OF THE LEGAL THEORY ASSERTED, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGES.

8. GOVERNING LAW AND SEVERABILITY
This Agreement shall be governed by, construed, and enforced in accordance with the laws of the jurisdiction of the Company's primary operations, without regard to conflicts of law principles. If any provision of these Terms is deemed invalid or unenforceable by a court of competent jurisdiction, the remaining provisions shall continue in full force and effect.`;

const PRIVACY_BODY = `Last Updated / Effective Date: ${LEGAL_EFFECTIVE}
Document Version: ${LEGAL_VERSION}

1. INTRODUCTION AND SCOPE
This Privacy Policy (the "Policy") outlines how Nitro Games (the "Company", "we", "us", or "our") collects, utilizes, stores, and protects the information and personal data of visitors and registered users (collectively, "Users" or "you") of our Platform. We are committed to maintaining the confidentiality and integrity of your data. By accessing or using our Platform, you explicitly consent to the collection and processing of your information in accordance with this Policy.

2. INFORMATION WE COLLECT
a) Account Data: Upon registering for an account, we collect credentials including your username, email address, password, and two-factor authentication (2FA) states.
b) Usage and Logging Data: We automatically collect technical data transmitted by your device, including your IP address, browser type, operating system version, page requests, referer URLs, and timestamp data.
c) Activity and Game Data: We track session metrics, including game interactions, custom playlist configurations, game saves, achievements, and presence status, to synchronize configuration states.

3. USE OF INFORMATION
We utilize the collected information for the following business purposes:
a) Provisioning, maintaining, and improving the Platform and its features;
b) Securing our servers, preventing fraud, and enforcing IP bans;
c) Facilitating client-side custom themes, configurations, and settings synchronization;
d) Communicating system announcements, updates, and responding to suggestions or support inquiries.

4. COOKIES AND LOCAL STORAGE
The Platform utilizes cookies, local storage (LocalStorage), and session storage (SessionStorage) to maintain active sessions, store user settings, and cache preferences. You may disable cookies through your browser settings, though doing so may prevent access to certain features and degrade usability.

5. DATA SHARING AND DISCLOSURE
We do not sell, trade, rent, or lease your personal information to third parties. We may disclose your information under the following narrow circumstances:
a) To comply with valid legal processes, subpoena, court order, or governmental requests;
b) To protect the rights, property, safety, and security of the Platform, its Users, or the general public;
c) In connection with a corporate merger, acquisition, or sale of assets.

6. DATA SECURITY AND RETENTION
We implement industry-standard administrative, technical, and physical security measures to safeguard your information from unauthorized access, loss, or disclosure. However, no method of transmission over the internet or database storage is completely secure; consequently, we cannot guarantee absolute security. We retain your data for as long as your account remains active or as required to fulfill the business purposes detailed herein.

7. USER RIGHTS
You possess the right to access, update, rectify, or request the deletion of your account data at any time. To exercise these rights, please navigate to your Account Settings panel or submit a support request.`;

const DMCA_BODY = `Last Updated / Effective Date: ${LEGAL_EFFECTIVE}
Document Version: ${LEGAL_VERSION}

1. COPYRIGHT INFRINGEMENT NOTIFICATION
Nitro Games (the "Company") respects the intellectual property rights of others and expects its users to do the same. In accordance with the Digital Millennium Copyright Act of 1998 (the "DMCA"), the text of which may be found on the U.S. Copyright Office website, the Company will respond expeditiously to claims of copyright infringement committed on our Platform that are reported to our Designated Copyright Agent.

If you are a copyright owner, or are authorized to act on behalf of one, please report alleged copyright infringements by completing a DMCA Notice of Alleged Infringement and delivering it to our Designated Agent. Upon receipt of a valid and complete notice, the Company will take appropriate actions, including the immediate removal of or disabling of access to the challenged material.

2. SUBMITTING A DMCA TAKEDOWN NOTICE
To be effective under the DMCA, your notice must be in writing and include the following:
a) A physical or electronic signature of the copyright owner or a person authorized to act on their behalf;
b) Precise identification of the copyrighted work claimed to have been infringed (e.g., links to original works or detailed descriptions);
c) Specific identification of the infringing material on our Platform, along with URL links or location details sufficient to allow us to locate it;
d) Your contact information, including physical address, telephone number, and email address;
e) A statement by you that you have a good-faith belief that the disputed use of the material is not authorized by the copyright owner, its agent, or the law;
f) A statement by you, made under penalty of perjury, that the information in your notice is accurate and that you are the copyright owner or authorized to act on the copyright owner's behalf.

Please send your DMCA Notice to our Designated Copyright Agent:
Email: legal@nitromath.org
Subject Line: DMCA Takedown Notice

3. COUNTER-NOTIFICATION PROCEDURES
If you believe that your material was removed or disabled by mistake or misidentification, you may submit a Counter-Notification in writing to our Designated Copyright Agent. To be valid under the DMCA, the Counter-Notification must include:
a) Your physical or electronic signature;
b) Identification of the material that was removed or disabled, and the location where it appeared before removal;
c) A statement, made under penalty of perjury, that you have a good-faith belief that the material was removed or disabled as a result of mistake or misidentification;
d) Your name, address, and telephone number;
e) A statement that you consent to the jurisdiction of the Federal District Court for the judicial district in which your address is located (or, if you reside outside the United States, that you consent to the jurisdiction of the Federal District Court for the district in which the Company is located), and that you will accept service of process from the person who provided the original infringement notification.

4. REPEAT INFRINGER POLICY
In accordance with the DMCA and other applicable laws, the Company maintains a strict policy of terminating, in appropriate circumstances and at our sole discretion, the accounts of users who are deemed to be repeat infringers of intellectual property rights.`;

function getLegalDocument(kind) {
  if (kind === 'terms') return { title: TERMS_TITLE, body: TERMS_BODY };
  if (kind === 'privacy') return { title: PRIVACY_TITLE, body: PRIVACY_BODY };
  if (kind === 'dmca') return { title: DMCA_TITLE, body: DMCA_BODY };
  return null;
}

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function pageIcon(kind) {
  if (kind === 'privacy') {
    return `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>`;
  }
  if (kind === 'dmca') {
    return `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M14.83 14.83A4 4 0 1 1 14.83 9.17"/></svg>`;
  }
  return `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>`;
}

function renderLegalHtml(kind) {
  const doc = getLegalDocument(kind);
  if (!doc) return null;
  const bodyHtml = escapeHtml(doc.body);
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="robots" content="index, follow" />
  <meta name="theme-color" content="#020810" />
  <title>${escapeHtml(doc.title)} · Nitro Games</title>
  <style>
    :root {
      --bg0: #020810;
      --line: hsla(210, 40%, 80%, 0.12);
      --text: #e8f0fa;
      --muted: hsla(210, 18%, 70%, 0.58);
      --faint: hsla(210, 14%, 60%, 0.42);
      --accent: #38bdf8;
      --accent-soft: hsla(200, 70%, 55%, 0.16);
    }
    * { box-sizing: border-box; }
    html, body {
      margin: 0;
      min-height: 100%;
      background: var(--bg0);
      color: var(--text);
      font-family: "Segoe UI", ui-sans-serif, system-ui, -apple-system, sans-serif;
      -webkit-font-smoothing: antialiased;
    }
    .space-twinkle {
      position: fixed;
      inset: 0;
      z-index: 0;
      pointer-events: none;
      opacity: 0.42;
      mix-blend-mode: screen;
      background-image:
        radial-gradient(1.2px 1.2px at 6% 12%, rgba(255,255,255,0.55), transparent),
        radial-gradient(1px 1px at 14% 38%, rgba(160,210,255,0.45), transparent),
        radial-gradient(1.4px 1.4px at 22% 18%, rgba(255,255,255,0.6), transparent),
        radial-gradient(1px 1px at 80% 48%, rgba(255,255,255,0.28), transparent),
        radial-gradient(1px 1px at 94% 18%, rgba(255,255,255,0.25), transparent);
    }
    .top-nav {
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      z-index: 100;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      padding: 10px 20px;
      background: hsla(216, 30%, 7%, 0.88);
      backdrop-filter: blur(16px) saturate(140%);
      -webkit-backdrop-filter: blur(16px) saturate(140%);
      border-bottom: 1px solid var(--line);
    }
    .nav-left {
      display: flex;
      align-items: center;
      gap: 10px;
      min-width: 0;
    }
    .pz-exit {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 7px 12px;
      border-radius: 9px;
      border: 1px solid var(--line);
      background: var(--accent-soft);
      color: #38bdf8;
      font-size: 12px;
      font-weight: 650;
      text-decoration: none;
      white-space: nowrap;
    }
    .pz-exit:hover { filter: brightness(1.1); }
    .nav-brand img {
      display: block;
      height: 28px;
      width: auto;
      border-radius: 7px;
    }
    .nav-brand-label {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      color: var(--text);
      font-size: 15px;
      font-weight: 800;
      letter-spacing: -0.02em;
      text-decoration: none;
    }
    .labs-badge {
      padding: 2px 7px;
      border-radius: 6px;
      background: hsla(200, 50%, 45%, 0.2);
      border: 1px solid hsla(200, 40%, 50%, 0.25);
      color: #38bdf8;
      font-size: 10px;
      font-weight: 650;
      letter-spacing: 0.05em;
      text-transform: uppercase;
    }
    .nav-links {
      display: flex;
      align-items: center;
      gap: 14px;
      flex-wrap: wrap;
    }
    .nav-link {
      color: var(--muted);
      text-decoration: none;
      font-size: 13px;
      font-weight: 600;
    }
    .nav-link:hover { color: var(--text); }
    .nav-link.active { color: #38bdf8; }
    .stage {
      position: relative;
      z-index: 1;
      min-height: 100dvh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 88px 20px 48px;
    }
    .panel {
      width: 100%;
      max-width: 640px;
      max-height: calc(100dvh - 136px);
      display: flex;
      flex-direction: column;
      border-radius: 14px;
      border: 1px solid var(--line);
      background: hsla(216, 28%, 9%, 0.96);
      box-shadow: 0 24px 60px rgba(0, 0, 0, 0.45);
      overflow: hidden;
    }
    .panel-head {
      padding: 22px 22px 16px;
      border-bottom: 1px solid var(--line);
      text-align: center;
      flex-shrink: 0;
    }
    .logo-tile {
      width: 56px;
      height: 56px;
      margin: 0 auto 14px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: linear-gradient(160deg, hsla(216, 28%, 14%, 0.95), hsla(216, 32%, 9%, 0.98));
      border: 1px solid var(--line);
      border-radius: 16px;
      color: #38bdf8;
    }
    .eyebrow {
      font-size: 10px;
      font-weight: 650;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: var(--muted);
      margin-bottom: 8px;
    }
    h1 {
      margin: 0 0 6px;
      font-size: clamp(1.25rem, 3vw, 1.45rem);
      font-weight: 750;
      letter-spacing: -0.03em;
    }
    .meta {
      margin: 0;
      color: var(--faint);
      font-size: 12px;
    }
    .panel-body {
      padding: 18px 22px 24px;
      overflow-y: auto;
      flex: 1;
      min-height: 0;
      text-align: left;
    }
    pre {
      margin: 0;
      white-space: pre-wrap;
      word-break: break-word;
      font-family: inherit;
      font-size: 0.88rem;
      line-height: 1.55;
      color: hsla(210, 30%, 88%, 0.88);
    }
    @media (max-width: 640px) {
      .nav-brand-label { display: none; }
      .panel { max-height: none; }
      .stage { align-items: flex-start; padding-top: 76px; }
    }
  </style>
</head>
<body>
  <div class="space-twinkle" aria-hidden="true"></div>
  <header class="top-nav">
    <div class="nav-left">
      <a class="pz-exit" href="/">← Exit to Nitro Games</a>
      <a class="nav-brand" href="/" aria-label="Nitro Games">
        <img src="/logo.png" alt="Nitro Games" height="28" onerror="this.style.display='none'" />
      </a>
      <a class="nav-brand-label" href="/">
        Nitro Games <span class="labs-badge">Legal</span>
      </a>
    </div>
    <nav class="nav-links">
      <a class="nav-link${kind === 'terms' ? ' active' : ''}" href="/terms">Terms</a>
      <a class="nav-link${kind === 'privacy' ? ' active' : ''}" href="/privacy-policy">Privacy</a>
      <a class="nav-link${kind === 'dmca' ? ' active' : ''}" href="/dmca">DMCA</a>
    </nav>
  </header>
  <main class="stage">
    <article class="panel">
      <div class="panel-head">
        <div class="logo-tile">${pageIcon(kind)}</div>
        <p class="eyebrow">Nitro Games Legal</p>
        <h1>${escapeHtml(doc.title)}</h1>
        <p class="meta">Effective ${escapeHtml(LEGAL_EFFECTIVE)} · Version ${escapeHtml(LEGAL_VERSION)}</p>
      </div>
      <div class="panel-body"><pre>${bodyHtml}</pre></div>
    </article>
  </main>
</body>
</html>`;
}

router.get('/terms', (req, res) => {
  const html = renderLegalHtml('terms');
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(html);
});

router.get('/tos', (req, res) => {
  res.redirect(301, '/terms');
});

router.get('/terms-of-service', (req, res) => {
  res.redirect(301, '/terms');
});

router.get('/terms-of-use', (req, res) => {
  res.redirect(301, '/terms');
});

router.get('/privacy-policy', (req, res) => {
  const html = renderLegalHtml('privacy');
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(html);
});

router.get('/privacy', (req, res) => {
  res.redirect(301, '/privacy-policy');
});

router.get('/dmca', (req, res) => {
  const html = renderLegalHtml('dmca');
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(html);
});

router.get('/copyright', (req, res) => {
  res.redirect(301, '/dmca');
});

module.exports = router;
