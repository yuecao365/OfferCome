---
name: security
description: Interviewing security engineers on web vulnerability mechanics, identity, crypto, SDL, pentest, incident response, cloud and supply chain.
keywords: [security, application security, appsec, penetration testing, pentest, red team, incident response, sdl, owasp, xss, cryptography, cloud security, supply chain security]
layer: domain
---

## What interviewers care about

Security roles split into several tracks: application security / secure development (SDL, code audit, building security components), penetration testing / red team (finding vulnerabilities from the attacker's side), security operations / blue team / incident response (detection, containment, attribution), and cloud and infrastructure security (IAM, network, containers, supply chain). The questions asked most often in real interviews are "why does this vulnerability exist, how is it exploited, and what fix is a root-cause fix rather than a bypass-able patch", and "an intrusion has happened; in what order do you respond". Interviewers care about three things above all. First, whether the fundamentals are solid: can the candidate explain the cause of a vulnerability at the protocol or code level rather than recite OWASP Top 10 names. Second, whether there is real attack-and-defense experience: what they found, what they fixed, how they kept false positives down. Third, a sense of balance between security and the business: knowing what to push hard on, what risk to accept, and how to get engineers to cooperate.

For campus hires, focus on fundamentals and hands-on skill: causes and payloads of common web vulnerabilities, HTTP and browser security mechanisms (same-origin, cookies, CSP), basic cryptography concepts, reading code to find problems, CTF or SRC experience. For experienced hires, focus on systems and judgment: SDL rollout, vulnerability governance and prioritization, running incident response, cloud permission governance, supply chain risk, false positives and coverage of security tooling. Security interviews at top domestic companies and multinationals have recently stressed "here is a piece of code or an alert, analyze it live", plus an understanding of identity systems (OAuth/OIDC/zero trust) and supply chain attacks.

How to ask like an interviewer in this field:
- Every vulnerability must be pressed down to the mechanism layer and the root-fix layer: after the candidate states a payload, follow up with "why does this vulnerability exist, why does your fix work, and what bypasses remain"; a candidate who can only recite terms and tool names is a red flag.
- Always ask about attack-and-defense experience, and make it verifiable: a vulnerability they found must come with its exploit chain, an incident they handled must come with its timeline; if they cannot give details, treat it as not done.
- Always test the balance between security and business: put the candidate in a "high severity but blocks the launch" scenario and watch the decision; a candidate who only vetoes outright or only caves completely is not mature.
- Do not test vulnerability IDs or tool versions, which go stale; test root-cause analysis, layered defense, and the ability to drive a fix to completion.

## Probing projects and internships

Where to cut in and what to press on when the resume shows the following kinds of experience. The probe is complete only when the candidate can explain the mechanism, where the numbers came from, and one real failure or trade-off; a candidate who offers only framework names and conclusions and cannot describe their own part is a red flag. For the general probing method see project-deep-dive.

- Resume shows SRC / CTF / vulnerability hunting → probe the most representative vulnerability: how it was found, the exploit chain, how the vendor fixed it, and what the candidate thinks the root-cause fix is
- Resume shows SDL / shift-left security program → probe how many repos were covered, tool false-positive rate, how fix rate and time-to-fix changed, how engineer cooperation was won
- Resume shows penetration testing projects → probe the authorized scope, how deep they got, the lateral movement path, and the hardest finding in the report to get fixed
- Resume shows incident response / security operations → probe the timeline of the most serious incident handled, daily alert volume and false-positive rate, how far attribution went, what detection rules came out of it
- Resume shows WAF / security gateway work → probe rule count, false-block rate, bypass cases, performance overhead, and how it relates to root-cause fixes
- Resume shows cloud security / IAM governance → probe the number of accounts and the permission model, progress on eliminating long-lived AKs, the most typical misconfiguration CSPM found
- Resume shows code audit → probe the audit method (tool versus manual ratio), the most hidden vulnerability found, how sinks and sources were mapped
- Resume shows supply chain / SBOM → probe dependency inventory coverage, response time at the last high-severity dependency outbreak, whether reachability analysis was done

## Common failures and red flags

- Injection: SQL, command, template: thinks using an ORM means no injection; fixes by filtering keywords; cannot distinguish the exploitation conditions of error-based and blind injection
- XSS, CSRF and the browser security model: knows only `<script>alert(1)</script>`; thinks SameSite solves all CSRF; does not know CSP nonce and strict-dynamic
- SSRF, files and deserialization: SSRF defense is only an IP blocklist; file upload checks only the extension; on deserialization knows only "Java has problems"
- Authentication and session security: thinks MD5 with a salt is enough for passwords; does not know JWT alg confusion; rate limits on IP alone
- OAuth2 / OIDC and authorization models: cannot tell authorization code from implicit flow; does not know what the state parameter is for; handles privilege escalation by "the frontend does not show the button"
- Applied crypto and key management: invents their own encryption algorithm; ECB mode; fixed nonce; commits keys in config files
- Secure development lifecycle (SDL) and code audit: SDL is just "scan once before release"; does not know what SAST and DAST each miss; audits by tool only
- Penetration testing methodology: only runs scanners; does not know the authorized scope; for privilege escalation knows only "find an exploit"
- Security operations, detection and incident response: first step is reinstalling the system; does not know to preserve memory and logs; no notification or escalation mechanism
- Cloud security and IAM: AK hardcoded in code; security group open to 0.0.0.0/0; does not know STS / role assumption
- Container and infrastructure security: thinks containers are isolated by nature; does not know ServiceAccount tokens are auto-mounted; does not scan images
- Supply chain security: does not pin dependency versions; does not know SBOM; CI secrets have excessive permissions
- Security governance and business communication: the two extremes of veto-everything or cave-completely; no severity grading standard; risk acceptance done verbally

## Frequently tested topics

Only names, ladders and signs of a solid answer are listed, as a reference for "how deep counts as solid"; which topics to ask and how many is decided by this JD and this resume, not a quota.

### Injection: SQL, command, template
- Ladder: what is the essence of injection → why parameterized queries work, cases where an ORM still allows injection, blind and out-of-band → how to locate injection points in a code audit (sinks and sources), how to drive the fix when the WAF blocks it but the root cause is unfixed → cost of full parameterization versus the WAF as a backstop, how to prioritize legacy systems
- Signs of a solid answer: classifies sinks (query, ORDER BY, table name, command line, template) with the fix for each; whitelist mapping; uses SAST rules or grep to find concatenation points in bulk; treats the WAF as a backstop only and knows the bypass techniques

### XSS, CSRF and the browser security model
- Ladder: the three kinds of XSS and the cause of CSRF → same-origin policy, cookie attributes (HttpOnly/SameSite/Secure), what CSP does and how it is bypassed, DOM XSS sinks → XSS still exploited despite automatic escaping in the frontend framework, cases where CSRF still works under SameSite=Lax and how to investigate → obstacles to rolling out strict CSP (inline scripts, third-party scripts) and phasing the rollout
- Signs of a solid answer: analyzes by sink, not by payload; combines CSRF tokens with SameSite; runs CSP in report-only first and then tightens; aware of postMessage, iframes, clickjacking

### SSRF, files and deserialization
- Ladder: why SSRF is dangerous → cloud metadata service, internal network probing, protocol smuggling, DNS rebinding → URL validation bypassed (redirects, IPv6, numeric encoding tricks), multiple bypasses for file upload, deserialization gadget chains, and how to defend → cost of funneling all egress through a proxy, whitelisting for deserialization versus replacing the serialization format
- Signs of a solid answer: resolves the IP before validating and forbids redirects; IMDSv2 or metadata protection; uploaded files renamed, storage isolated, content inspected; deserialization replaced with JSON or a strongly typed whitelist

### Authentication and session security
- Ladder: difference between authentication and authorization → password storage (bcrypt/argon2, salting), MFA, session fixation, common JWT mistakes (alg none, weak key, no revocation) → login endpoint hit by credential stuffing, CAPTCHA bypassed, how to stop the damage and trace after a token leak → obstacles to pushing passwordless and Passkey, balancing risk control and user experience
- Signs of a solid answer: slow hashes and parameter choice; JWT with a fixed algorithm, short-lived tokens plus refresh rotation; multi-dimensional rate limiting by device/account/IP with risk scoring; a concrete path for session revocation

### OAuth2 / OIDC and authorization models
- Ladder: which OAuth2 grant types fit which scenarios → why authorization code plus PKCE is needed, state to prevent CSRF, strict redirect_uri matching, ID token versus access token → an open platform is reported for "account takeover"; possible causes are loose redirect_uri matching, token leaked via referer, the implicit flow; how to investigate → choosing among RBAC/ABAC/ReBAC, central authorization service versus scattered decisions, systematic governance of privilege escalation bugs
- Signs of a solid answer: PKCE and exact matching; tokens never in URLs; ownership checks enforced at the data access layer (IDOR governance); aware of fine-grained authorization systems (policy engines)

### Applied crypto and key management
- Ladder: what symmetric, asymmetric, hashing and signatures each do → choosing AES modes (GCM versus CBC, consequences of IV/nonce reuse), TLS handshake and certificate chain, HMAC and signature verification → a home-grown encryption scheme bypassed, key rotation is hard after a leak, an expired certificate takes down the whole site, and how to handle each → cost of adopting a key management system (KMS/HSM), conflict between end-to-end encryption and business features (search, risk control)
- Signs of a solid answer: AEAD first; HMAC rather than bare hashes; layered keys (KEK/DEK) and rotation; certificate automation and expiry alerts; knows what not to implement yourself

### Secure development lifecycle (SDL) and code audit
- Ladder: what stages SDL includes → threat modeling, security requirements, coverage and limits of SAST/DAST/SCA/IAST, security gates → scanner false positives so high engineers ignore it, fix rate will not rise, security becomes a release bottleneck, and how to change that → return on shifting left, which stages to automate and which must stay manual, security components replacing training
- Signs of a solid answer: threat modeling starts from data flows and trust boundaries; tools are layered with incremental gates; provides a security SDK (unified authentication, encryption, parameter validation) instead of fixing item by item; measures by vulnerability escape rate and time-to-fix

### Penetration testing methodology
- Ladder: difference between penetration testing and scanning → the flow of information gathering, attack surface mapping, vulnerability verification, privilege escalation, lateral movement → after getting a web shell, how to prove impact without disrupting the business, common lateral paths in an internal network (credentials, services, trust relationships) → authorization boundaries and legal risk, how to write a report so engineers will fix, setting objectives for red-versus-blue exercises
- Signs of a solid answer: asset and attack-surface mapping first; a complete and reproducible exploit chain; lateral movement via credential theft, service abuse, misconfiguration paths; report ordered by risk and fix cost

### Security operations, detection and incident response
- Ladder: what signals intrusion detection looks at → log collection and correlation, division of labor among EDR/HIDS/NIDS, detection rules mapped to ATT&CK → a "suspected webshell" alert arrives; how to judge within half an hour whether it is real, its blast radius, and whether to isolate; how to fix analyst fatigue from too many false positives → conflict between containment and business continuity, where to stop investing in attribution, how a postmortem turns into detection capability
- Signs of a solid answer: confirm before isolating, and isolate in a way that preserves the scene; forensics ordered by volatility; uses a timeline to correlate logins, processes, network; produces IOCs and detection rules

### Cloud security and IAM
- Ladder: the shared responsibility model in the cloud → least-privilege IAM, temporary credentials, role assumption, misconfigured buckets and security groups → what an attacker does after an AK leaks to GitHub, how to stop the damage within minutes, how to audit the impact afterward → obstacles to centralized permission governance, cost of a multi-account architecture and automated security baselines
- Signs of a solid answer: disables immediately rather than deleting, preserving the audit trail; checks audit logs for anomalous API calls; moves to roles and temporary credentials; continuous configuration baseline scanning (CSPM)

### Container and infrastructure security
- Ladder: common container escape routes → privileged containers, hostPath, capability sets, image vulnerabilities, K8s RBAC and admission control → once a Pod in the cluster is compromised, how far can the attacker go (ServiceAccount token, metadata, etcd) and how to limit it → noise and coverage of runtime detection (Falco-style), cost of rolling out image signing and admission policies
- Signs of a solid answer: minimal capability set and non-root; auto-mounted tokens disabled; default-deny NetworkPolicy; image signing and admission verification; runtime behavior baselines

### Supply chain security
- Ladder: what a supply chain attack is → dependency poisoning, typosquatting, build system compromise, SBOM and signing → a deep dependency is hit by a high-severity vulnerability: how to find the blast radius across thousands of repos and judge exploitability; how to stop the damage when CI secrets are stolen → tension between dependency pinning and update speed, governance cost of private mirrors and internal proxies
- Signs of a solid answer: SCA and a central SBOM inventory; reachability analysis to separate "included" from "exploitable"; private sources and mirror approval; build artifact signing and provenance verification

### Security governance and business communication
- Ladder: common conflicts between security and engineering → vulnerability severity standards, SLAs, exemption process, security review up front → a business owner delays a high-severity fix as "it blocks the launch" or security requirements get cut, and how to push through → decision mechanism and accountability for risk acceptance, how to quantify security investment for management
- Signs of a solid answer: quantifies by exploitability and impact; temporary mitigation (WAF rules, feature flags, heightened monitoring); risk acceptance signed in writing; follow-up until the fix lands
