# 🚨 ResQMesh — Jury Pitch Deck & Technical Defense Plan

> **Project Name:** ResQMesh  
> **Tagline:** Disconnected-First Disaster Coordination Infrastructure  
> **Target Audience:** Hackathon Judges, Technical Evaluators, Disaster Management Domain Experts  
> **Format:** Ready-to-Deliver Pitch Script + Technical Feasibility Proof + Jury Q&A Defense  

---

## 📋 Executive Overview & Quick Links

| Section | Purpose | Ideal Delivery Time |
| :--- | :--- | :--- |
| **[1. The 30-Second Elevator Hook](#1-the-30-second-elevator-hook)** | For rapid judge table walk-bys & intro | 30 seconds |
| **[2. The Real-World Problem](#2-the-real-world-problem-the-4-disaster-blackouts)** | Grounding the pitch in urgent, visceral reality | 60 seconds |
| **[3. The ResQMesh Solution & How It Works](#3-the-resqmesh-solution--how-it-works)** | Clear explanation of the coordination layer | 60 seconds |
| **[4. The MVP vs. Roadmap (The Honesty Filter)](#4-the-mvp-vs-roadmap-what-we-built-vs-what-we-planned)** | Convincing judges through technical credibility | 45 seconds |
| **[5. The 4 USPs (Why We Stand Out)](#5-our-4-unique-selling-propositions-usps)** | Differentiating from generic disaster apps | 45 seconds |
| **[6. Feature-to-Problem Direct Mapping](#6-feature-to-problem-direct-mapping)** | Showing that every line of code solves a pain point | 30 seconds |
| **[7. Why Judges Should Believe We Can Build This](#7-why-the-jury-should-believe-we-can-build-this-feasibility-proof)** | Architecture, engineering rigor & team execution | 60 seconds |
| **[8. Five-Minute Stage Pitch Script](#8-five-minute-main-stage-presentation-script)** | Word-for-word delivery guide with slide & screen cues | 5 minutes |
| **[9. The "Killer Questions" Jury Q&A Defense](#9-the-killer-questions-jury-qa-survival-guide)** | Defending tough technical & operational questions | Q&A Session |
| **[10. Live Demo Golden Path & Fallback Plan](#10-live-demo-golden-path--recovery-playbook)** | Step-by-step click guide to guarantee zero demo glitches | Demo Time |

---

## 1. The 30-Second Elevator Hook

> **Say this with high energy and confidence:**
>
> *"Judges, when severe floods, cyclones, or earthquakes strike, cell towers lose power within 2 hours, fiber cuts sever the internet, and central emergency dashboards go dark.*  
> *Yet millions of survivors have fully charged smartphones in their pockets with functional Wi-Fi and Bluetooth chips—rendered completely useless because today's apps depend on a live cloud.*  
>  
> *We built **ResQMesh**: a disconnected-first coordination infrastructure that turns civilian devices and emergency vehicles into an offline store-and-forward mesh network. It captures cryptographically signed SOS requests with zero internet, routes them hop-by-hop to rescue bridges, matches them to community resources, and gives responders an evidence-backed operational picture."*

---

## 2. The Real-World Problem: The 4 Disaster Blackouts

Most hackathon disaster projects build a standard web dashboard with a Google Maps pin and an SOS form. **In a real disaster, that entire architecture collapses immediately.**

We designed ResQMesh to directly solve the **Four Real-World Disaster Blackouts**:

```
┌────────────────────────────────────────────────────────────────────────┐
│                        THE 4 DISASTER BLACKOUTS                        │
├────────────────────────┬───────────────────────────────────────────────┤
│ 1. CONNECTIVITY GAP    │ Cell towers down. 0 bars. Normal apps crash   │
│                        │ or spin indefinitely. Trapped people can't    │
│                        │ reach emergency dispatch.                     │
├────────────────────────┼───────────────────────────────────────────────┤
│ 2. VISIBILITY GAP      │ 500m away, a volunteer has a boat or a clinic │
│                        │ has 5 ICU beds, but official responders have  │
│                        │ zero awareness of civilian community assets.  │
├────────────────────────┼───────────────────────────────────────────────┤
│ 3. STATIC MAP FAILURE  │ Roads flood or collapse. Static GPS maps send │
│                        │ rescue ambulances directly into dead ends or  │
│                        │ hazardous waters.                             │
├────────────────────────┼───────────────────────────────────────────────┤
│ 4. TRUST COLLAPSE      │ Panicked rumors and outdated screenshots flood│
│                        │ social media. Responders waste precious golden│
│                        │ hours chasing unverified reports.             │
└────────────────────────┴───────────────────────────────────────────────┘
```

---

## 3. The ResQMesh Solution & How It Works

ResQMesh does not replace official national disaster response; **it bridges the last-mile digital void** when centralized systems are severed.

### The End-to-End Architecture Flow

```
   [ Survivor Phone ]             [ Community Volunteer ]
   (No SIM / No Internet)          (Has Boat / Generator)
          │                                 │
   1-Tap Offline SOS                Registers Capacity
   Ed25519 Local Signature          IndexedDB Local Store
   Stored in IndexedDB                     │
          │                                 │
          ▼                                 ▼
   ┌──────────────────────────────────────────────┐
   │         OFFLINE LOCAL P2P RELAY              │
   │  - Store-and-Forward Bounded Gossip          │
   │  - Max 3 Hops, 30-min TTL, 1024-entry Dedupe │
   │  - Strict Frame Bounds (<= 3 KB)             │
   └──────────────────────────────────────────────┘
                          │
                   Moves hop-by-hop
                          │
                          ▼
            ┌───────────────────────────┐
            │ RESCUE VEHICLE / BRIDGE   │
            │ (Patrol Car / Field Node) │
            │ Stores receipt locally    │
            └───────────────────────────┘
                          │
               Reaches network boundary
                          │
                          ▼
            ┌───────────────────────────┐
            │   FASTAPI REGIONAL API    │
            │  - Idempotent Ingestion   │
            │  - Ed25519 Cryptographic  │
            │    Signature Verification │
            │  - PostgreSQL 16 Store    │
            └───────────────────────────┘
                          │
                          ▼
            ┌───────────────────────────┐
            │   RESPONDER COORDINATION  │
            │  - Need ↔ Resource Match  │
            │  - Confidence Decay (Map) │
            │  - Provenance & Audit Log │
            └───────────────────────────┘
```

1. **Capture Before Connection:** A trapped survivor selects their need (Medical, Rescue, Food/Water, Shelter) and priority. The phone creates an Ed25519 cryptographic key pair locally, signs the payload, and commits it durably to `IndexedDB` with status `SAVED_LOCAL`. **No login, no phone number, no network needed.**
2. **Opportunistic Relay (Store & Forward):** The packet hops across nearby devices using bounded local protocol frames (`EVENT_OFFER` → `EVENT_REQUEST` → `EVENT_PUSH` → `EVENT_ACK`). Deduplication caches prevent broadcast storms.
3. **Bridge Synchronization:** A mobile rescue unit or volunteer vehicle acting as a bridge receives the packet (`BRIDGE_ACKED`). When the vehicle moves into an area with satellite, cellular, or microwave backhaul, it synchronizes via an idempotent API (`POST /v1/events`).
4. **Intelligent Coordination:** The regional operations console ingests the event, matches it to registered community assets using deterministic spatial-capability rules, and renders operational reports with visible time-decayed confidence.

---

## 4. The MVP vs. Roadmap (What We Built vs. What We Planned)

Judges hate hand-waving and inflated claims. **Our honesty is our greatest weapon.** We win the jury's trust by showing exact architectural boundaries:

```
┌────────────────────────────────────────┬────────────────────────────────────────┐
│           WHAT IS BUILT & PROVEN       │           ROADMAP FOR PRODUCTION       │
│           (Live in Today's MVP)        │           (Next Milestone)             │
├────────────────────────────────────────┼────────────────────────────────────────┤
│ ✅ 1-Tap Offline SOS Capture           │ 🔄 Native BLE / Wi-Fi Aware background │
│    - Zero-login, IndexedDB storage     │    daemon (our wire protocol is        │
│    - Survives browser reloads/crashes  │    already transport-neutral)          │
│                                        │                                        │
│ ✅ Ed25519 Cryptographic Envelope      │ 🔄 PostGIS multi-polygon complex       │
│    - In-browser WebCrypto signing      │    evacuation routing                  │
│    - Canonical JSON byte serialization │                                        │
│    - Python API verification           │ 🔄 Official CAP (Common Alerting       │
│                                        │    Protocol) agency ingestion gateway  │
│ ✅ Bounded P2P Relay Engine            │                                        │
│    - 7-frame state machine             │ 🔄 Hardware LoRa / Meshtastic long-    │
│    - Max 3 hops ceiling                │    range gateway bridge adapters       │
│    - 1024-entry deduplication cache    │                                        │
│    - TTL automatic expiry              │ 🔄 Multi-region active-active cluster  │
│                                        │    database replication                │
│ ✅ Deterministic Resource Matcher      │                                        │
│    - Geohash spatial proximity         │                                        │
│    - Capability & freshness scoring    │                                        │
│                                        │                                        │
│ ✅ Live Confidence Decay               │                                        │
│    - Real-time mathematical decay of   │                                        │
│      unconfirmed road reports          │                                        │
│    - Corroboration refresh button      │                                        │
└────────────────────────────────────────┴────────────────────────────────────────┘
```

> **What to tell the jury:**  
> *"Judges, web browsers cannot run native peer-to-peer Bluetooth Low Energy in background sleeping states due to OS sandbox constraints. Anyone who claims they built native BLE mesh inside a pure browser hackathon project is not telling you the truth.  
> Instead, we did the real engineering: we built a **transport-neutral frame protocol** running over a local WebSocket LAN simulator for the demo, which plugs directly into a native Android/iOS background service without changing a single line of data contract or cryptographic code."*

---

## 5. Our 4 Unique Selling Propositions (USPs)

When judges ask: *"Why are you different from existing disaster apps or Google Crisis Response?"*, hit them with these four USPs:

### 1. Disconnected-First Architecture (Zero-Byte Dependency)
Every standard app fails at the first step because it requires an HTTPS call to initiate. ResQMesh treats disconnected mode as the **default happy path**, not an exception. SOS creation, local persistence, key generation, and relay queues operate 100% offline.

### 2. Live Confidence Decay (Truth Without Black-Box AI)
In a disaster, an unconfirmed report from 45 minutes ago that a road is blocked might be fatal if conditions changed. ResQMesh implements a deterministic **Confidence Decay Algorithm**:
$$\text{Score} = \text{Base} \times e^{-\lambda \cdot \Delta t} + \text{Corroboration Boost}$$
A fresh report starts at 94% (solid red). After 20 minutes with no updates, it automatically decays to 60% (amber/dim). When another responder confirms it, it surges back to 94%. We do not invent certainty—we make uncertainty visually transparent.

### 3. Community Resource Mesh (Civilian Power Unleashed)
Disaster response shouldn't just be centralized fire engines and ambulances. ResQMesh turns local civilian assets—private 4x4s, inflatable boats, portable generators, volunteer doctors—into discoverable, matched assets using a structured `Need -> Capability -> Location -> Availability` engine.

### 4. Cryptographic Provenance at the Edge
Every packet carries an Ed25519 signature generated directly on the survivor's handset. If a malicious relay node tries to tamper with the priority, change the location, or alter the payload, the backend verifier instantly detects the signature mismatch (`422 SIGNATURE_INVALID`) and discards the packet.

---

## 6. Feature-to-Problem Direct Mapping

Use this quick-reference table to prove that every feature exists for a life-safety reason:

| Real Disaster Failure | ResQMesh Feature | Technical Implementation | Life-Safety Impact |
| :--- | :--- | :--- | :--- |
| **Towers down; phone has 0 bars** | Offline SOS & IndexedDB Storage | Local WebCrypto Ed25519 + IndexedDB queue | Survivor can hit SOS immediately; data will never vanish on reload. |
| **No direct path to emergency HQ** | Store-and-Forward Peer Relay | 7-frame WebSocket adapter, Max 3 hops, TTL | Message travels through neighbors and patrol cars until it finds a connection. |
| **Network flooded by repeat messages** | 1024-entry Deduplication Cache | Bounded LRU event ID cache + Idempotent API | Prevents mesh congestion and ensures responders see exactly 1 canonical ticket. |
| **Responders don't know who has what** | Deterministic Resource Matcher | 4-char Geohash prefix filter + Capability rules | Immediately pairs a drowning victim with the nearest registered boat volunteer. |
| **Responders navigating into floodwaters** | Dynamic Confidence Decay | Exponential decay timer + Corroboration API | Prevents rescue teams from acting on outdated 2-hour-old road blockage reports. |
| **Bad actors sending fake emergencies** | Cryptographic Provenance Panel | Ed25519 signature verification + Origin Audit Log | Responders see verifiable evidence trail; tampering is mathematically impossible. |

---

## 7. Why the Jury Should Believe We Can Build This (Feasibility Proof)

Judges often say: *"Great idea, but it sounds too complex for your team to actually build."*  
**Here is how you dismantle that doubt:**

### Proof Point 1: Strict Architectural Separation & Frozen Contracts
We didn't just start writing random spaghetti code. We implemented enterprise-grade engineering rigor:
- We froze the data contract in **`packages/contracts/types.ts`** and **`apps/api/app/contracts.py`** before writing business logic.
- The client and backend share identical enums: `DeliveryState` (`SAVED_LOCAL` → `QUEUED_FOR_RELAY` → `PEER_ACKED` → `BRIDGE_ACKED` → `SYNCED`).
- Pydantic models enforce `extra = "forbid"`—no unexpected fields or malformed payloads can ever enter the database.

### Proof Point 2: Battle-Tested Minimal Stack (No Over-Engineering)
- We deliberately rejected heavy graph databases (like Neo4j) and GIS extensions (like PostGIS) for our core MVP.
- Instead, we used **PostgreSQL 16 with deterministic 6-character Geohash indexes**.
- This guarantees sub-millisecond lookups on ordinary hardware, zero complex cloud dependencies, and instant deployability in field command centers.

### Proof Point 3: Disciplined 6-Lane Division of Labor
Our team operated like a professional software engineering squad:
1. **Lane 1 (Architecture & Contracts):** Frozen API envelope specs, data models, schema validation.
2. **Lane 2 (Client PWA & Persistence):** 360px mobile viewport, IndexedDB durability, accessible keyboard UX.
3. **Lane 3 (Mesh Relay Engine):** Frame validation, hop ceilings, deduplication cache, rate limits.
4. **Lane 4 (Backend API & Projections):** FastAPI, idempotent event ingestion, deterministic resource matching.
5. **Lane 5 (Security & Reliability):** WebCrypto Ed25519 signatures, automated test suite, failure path verification.
6. **Lane 6 (QA & Fixtures):** Deterministic flood scenario fixtures, synthetic seed scripts, repeatable demo harness.

### Proof Point 4: Built-in Graceful Degradation
Even if parts of our system go down, the product does not crash:
- **API Down?** PWA continues saving SOS events locally and relaying them to nearby peers.
- **Map Service Blocked?** The UI gracefully falls back to plain-text Geohashes and street names.
- **AI Service Offline?** Deterministic rule-based matching runs with 100% precision.

---

## 8. Five-Minute Main Stage Presentation Script

*Use this exact timed script for your pitch presentation.*

### Minute 0:00 – 0:45 | The Hook & The Problem
> **Presenter 1:**  
> *"Good morning, esteemed judges. Imagine this: heavy monsoon rains breach a river embankment. Within 90 minutes, cell towers lose battery backup. The cellular network flatlines.  
> Right now, in that flooded district, there are 10,000 citizens with working smartphones in their hands. But when they try to open an emergency app or send a WhatsApp message, they see a spinning wheel. The phone is a brick.  
> Meanwhile, two kilometers away, the local disaster management room is operating in the dark. They don't know who is stranded, they don't know that a local volunteer group has four rescue boats ready, and their patrol vehicles are driving down a road that was submerged an hour ago.  
> This is not a failure of will. It is a failure of architecture. Centralized clouds do not belong in severed disaster zones.  
> That is why we built **ResQMesh**."*

### Minute 0:45 – 1:30 | The ResQMesh Vision & The Core Demo
> **Presenter 1:**  
> *"ResQMesh is a disconnected-first disaster coordination infrastructure. It does three things:  
> First, it captures emergencies with zero connectivity.  
> Second, it moves those alerts hop-by-hop across civilian phones and rescue vehicles using store-and-forward mesh relay.  
> Third, it provides responders with an evidence-based knowledge graph that matches community resources to urgent needs."*  
>  
> *(Hands over to Presenter 2 / Operator)*  
>  
> **Presenter 2 (Screen Demonstration):**  
> *"Let's look at the screen. We have simulated complete airplane mode. No internet.  
> As a citizen, I don't need to create an account or verify an OTP. I tap 'Medical Emergency', select my locality, and hit 'Send SOS'.  
> Look at the status bar: it immediately transitions to `SAVED_LOCAL`.  
> What just happened behind the scenes? Our client generated an Ed25519 key pair, cryptographically signed the packet, and committed it to IndexedDB. If I refresh the browser or restart the phone right now, the message is permanently preserved."*

### Minute 1:30 – 2:30 | The Mesh Relay & Bridge Sync
> **Presenter 2:**  
> *"Now, another citizen or a community volunteer walks within Wi-Fi or Bluetooth range.  
> Our relay engine initiates a 7-frame handshake: `EVENT_OFFER` and `EVENT_REQUEST`. The event hops to the neighbor's device. Notice the status updates to `PEER_ACKED`.  
> To prevent spam and battery drain, our protocol enforces three hard limits: a maximum 3-hop ceiling, a 30-minute Time-To-Live, and a 1024-entry deduplication cache. If 50 people relay the same SOS, our deduplication engine ensures it only processes once.  
> Now, a rescue boat or patrol vehicle equipped with a ResQMesh bridge node passes through the neighborhood. The event hops onto the vehicle (`BRIDGE_ACKED`).  
> The moment this vehicle reaches a satellite link or an operational cell tower, it syncs with our regional FastAPI backend via idempotent ingestion. The citizen's phone gets the final state: `SYNCED`."*

### Minute 2:30 – 3:30 | Responder Console, Resource Matching & Confidence Decay
> **Presenter 1:**  
> *"Now let's switch to the District Responder Console.  
> The responder sees the verified medical SOS appear on the incident board. Notice the **Provenance Panel**: it shows the exact origin key ID, the number of relay hops, the timestamp, and cryptographic validation.  
> But responders don't just need alerts—they need solutions.  
> ResQMesh runs our **Deterministic Resource Matcher**. It automatically searches available community resources within the same Geohash sector. In one second, it recommends: 'Ambulance Unit 2 — 800m away, Available, Verified 4 minutes ago'. The responder clicks 'Assign', and the mission is locked.  
> Next, look at our road hazard intelligence. We have a report of a submerged culvert. Notice the **Confidence Decay Widget**. Right now, it shows 94% confidence—solid red.  
> But in a disaster, conditions change rapidly. As the demo clock advances 20 minutes without any new confirmation, look at what happens: the confidence automatically decays to 60%, turning amber. We never trick responders into trusting stale information.  
> When a patrol unit clicks 'Confirm Blocked', it immediately surges back to 94%."*

### Minute 3:30 – 4:15 | Technical Feasibility & Architecture
> **Presenter 1:**  
> *"Judges, we know you see many ambitious disaster ideas that fall apart in technical questioning. Here is why ResQMesh is practically buildable:  
> 1. **Transport-Neutral Envelope:** Our protocol frames are payload-agnostic. While we demonstrate over local WebSocket LAN today, the exact same contract maps directly to native Android Wi-Fi Aware and BLE without backend changes.  
> 2. **PostgreSQL 16 & Geohashing:** We eliminated heavy graph DB and PostGIS dependencies in favor of ultra-fast 6-character Geohash indexes, making this deployable on a $50 Raspberry Pi in a field tent.  
> 3. **Cryptographic Rigor:** Every packet is Ed25519 signed at the edge and verified in Python. Tampering with an emergency payload breaks the signature and causes instant rejection (`422 SIGNATURE_INVALID`)."*

### Minute 4:15 – 5:00 | Conclusion & Vision
> **Presenter 1:**  
> *"In a disaster, the first 60 minutes—the Golden Hour—determines survival. When towers collapse, we cannot afford to wait 48 hours for central telecom restoration.  
> With ResQMesh, every phone in the community becomes part of the rescue infrastructure.  
> We move from centralized vulnerability to decentralized resilience.  
> Thank you, and we welcome your questions!"*

---

## 9. The "Killer Questions" Jury Q&A Survival Guide

Expect tough questions from technical and domain judges. Use these battle-tested responses:

### Q1: "Why not just use WhatsApp or an existing emergency SMS broadcast system?"
> **The Winning Answer:**  
> *"WhatsApp, Telegram, and standard SMS all require an active cellular tower and an upstream connection to telecom backhaul. In disasters like the Chennai floods or Hurricane Katrina, cell towers lose power within two to four hours.  
> When towers are down, WhatsApp cannot send a single packet. SMS broadcasts are one-way sirens from government to citizen; they do not allow a trapped survivor to send their location back.  
> ResQMesh is peer-to-peer and disconnected-first. It creates an ad-hoc local data conduit where WhatsApp and SMS are completely dead."*

### Q2: "You are running this in a browser PWA. Browsers cannot do true background BLE mesh networking. How can you claim this works?"
> **The Winning Answer:**  
> *"That is an insightful observation, and we want to be 100% transparent. Current browser security sandboxes do not allow background Bluetooth Low Energy advertising or scanning when the screen is locked.  
> We did not build a fake browser hack. Instead, we designed a **transport-neutral protocol contract** with a 7-frame state machine (`HELLO`, `OFFER`, `REQUEST`, `PUSH`, `ACK`). For today's demo, we demonstrate this using a local WebSocket LAN adapter.  
> On our production roadmap, the client logic is wrapped in a native Android/iOS background daemon (using Android Wi-Fi Aware / Nearby Connections API). Because our data envelope and Ed25519 signing are completely decoupled from the transport layer, the transition to native requires zero changes to the core engine."*

### Q3: "What prevents someone from spamming the mesh with thousands of fake SOS alerts to crash the system?"
> **The Winning Answer:**  
> *"We implemented a defense-in-depth anti-abuse mechanism at three distinct layers:  
> 1. **At the Mesh Relay Layer:** Packets have a strict size ceiling of 3,072 bytes. Relay nodes enforce per-peer token-bucket rate limits and drop anything beyond a 3-hop ceiling.  
> 2. **At the Node Memory Layer:** Every device maintains a 1024-entry LRU deduplication cache. Identical `event_id`s are suppressed instantly without retransmission.  
> 3. **At the Cryptographic Layer:** Every SOS is signed with Ed25519. Ingestion rejects unverified signatures.  
> While anyone can claim an emergency, an attacker cannot amplify traffic or flood the mesh into a denial-of-service collapse."*

### Q4: "What happens if someone submits a completely false report that a road is clear when it's actually flooded?"
> **The Winning Answer:**  
> *"This is precisely why we created the **Confidence Decay Engine** and **Immutable Conflict Graph**.  
> ResQMesh never treats user reports as absolute truth. When two conflicting reports arrive for the same bridge, the system does not overwrite the old one. It flags the status as `CONFLICTING` on the responder dashboard and displays both source key IDs.  
> Furthermore, unconfirmed reports decay in confidence over time. Responders see that the report is uncorroborated, allowing them to dispatch a reconnaissance drone or require responder verification before sending heavy vehicles."*

### Q5: "How does this scale when an entire city of 5 million people is affected?"
> **The Winning Answer:**  
> *"ResQMesh is architected specifically to prevent centralized bottlenecks:  
> 1. **Mesh Localization:** The P2P relay has a 3-hop limit. A localized mesh in Sector A never floods traffic into Sector B.  
> 2. **Spatial Partitioning:** Backend ingestion partitions all writes by `incident_id` and 6-character Geohash buckets (~1.2 km²).  
> 3. **Append-Only Idempotent Log:** The API does not run heavy relational joins on ingestion. It performs an append-only write (`POST /v1/events`), and responder views are populated via asynchronous read projections.  
> The system scales horizontally by geographic cell."*

### Q6: "Why didn't you finish 100% of the features before the hackathon ended?"
> **The Winning Answer:**  
> *"In safety-critical disaster software, building an unstable, unverified monolith is dangerous.  
> We deliberately chose to build a **rock-solid, verified vertical slice** rather than a shallow prototype with fake mockups.  
> We completed and tested the hardest engineering foundations: offline persistence that survives device restarts, WebCrypto Ed25519 signing, a 7-frame relay state machine with deduplication, and an idempotent FastAPI ingestion backend with automated security failure tests.  
> Everything you see on our screen is real, verified code—and our modular architecture guarantees that roadmap items like native BLE adapters plug in cleanly."*

---

## 10. Live Demo Golden Path & Recovery Playbook

To ensure the live demo goes smoothly with zero awkward silences or bugs, follow this exact sequence:

```
┌────────────────────────────────────────────────────────────────────────┐
│                        LIVE DEMO CLICK SEQUENCE                        │
├──────┬──────────────────────┬──────────────────────────────────────────┤
│ STEP │ SCREEN / ACTION      │ WHAT TO POINT OUT TO THE JURY            │
├──────┼──────────────────────┼──────────────────────────────────────────┤
│ 1    │ Open Citizen PWA     │ Point out the "OFFLINE" indicator.       │
│      │ Tab ("SOS")          │ Show that the form requires NO login     │
│      │                      │ and NO phone number (privacy-first).     │
├──────┼──────────────────────┼──────────────────────────────────────────┤
│ 2    │ Fill: Medical Need,  │ Click "Send SOS". Point out instant      │
│      │ Priority: CRITICAL,  │ transition to "SAVED_LOCAL". Explain     │
│      │ Geohash: tdr1q0      │ that Ed25519 signature is already done.  │
├──────┼──────────────────────┼──────────────────────────────────────────┤
│ 3    │ Hard Refresh Browser │ Show that the event is still in the      │
│      │ (Ctrl + R / F5)      │ queue. Proves real IndexedDB durability! │
├──────┼──────────────────────┼──────────────────────────────────────────┤
│ 4    │ Toggle Simulated     │ Status updates: "SAVED_LOCAL" →          │
│      │ Peer Relay           │ "QUEUED_FOR_RELAY" → "PEER_ACKED".       │
│      │                      │ Explain the 7-frame handshake.           │
├──────┼──────────────────────┼──────────────────────────────────────────┤
│ 5    │ Bridge Sync          │ Vehicle bridge reaches connectivity.     │
│      │                      │ Status turns green: "SYNCED".            │
├──────┼──────────────────────┼──────────────────────────────────────────┤
│ 6    │ Switch to "Responder │ Point out the new incoming SOS with its  │
│      │ Console" Tab         │ Provenance Panel (Key ID, Hops, Time).   │
├──────┼──────────────────────┼──────────────────────────────────────────┤
│ 7    │ Switch to "Resources"│ Click "Find Matches". Show deterministic │
│      │ Tab                  │ match: Ambulance within geohash bucket,  │
│      │                      │ with factual rationale bullet points.    │
├──────┼──────────────────────┼──────────────────────────────────────────┤
│ 8    │ Confidence Decay     │ Show Road Hazard at 94% (solid red).     │
│      │ Demo                 │ Click "+20m" clock advance: fades to 60% │
│      │                      │ (amber). Click "Corroborate": snaps back │
│      │                      │ to 94% with a pulse.                     │
└──────┴──────────────────────┴──────────────────────────────────────────┘
```

### Emergency Recovery Playbook (If Something Glitches)

| Failure During Demo | Don't Panic! Say This: | Technical Recovery Action |
| :--- | :--- | :--- |
| **Relay WebSocket disconnects** | *"Notice how the client immediately detects the peer drop and holds the SOS safely in `SAVED_LOCAL` with exponential backoff retry. It never drops data."* | Refresh client tab; IndexedDB will restore the queue automatically. |
| **Backend API takes too long / 500** | *"This proves our core architectural principle: backend unavailability does not disrupt the survivor's ability to record and mesh the emergency."* | Use the seed script: `python packages/fixtures/seed_reset.py` in the terminal to restore state in 2 seconds. |
| **Projector / Screen resolution looks weird** | *"Our interface is engineered mobile-first at 360px viewport with 44px minimum touch targets and visible high-contrast focus rings."* | Press `F12` and toggle Chrome DevTools Mobile View (`Ctrl + Shift + M`). |

---

## 11. Final Closing Statement (To Leave a Lasting Impression)

> *"Judges, the technology to connect people in cities during peacetime is everywhere. But the true test of engineering is what happens when the power cuts out, the towers fall, and the waters rise.  
>  
> ResQMesh doesn't wait for the infrastructure to be rebuilt. It makes the community the infrastructure.  
>  
> Thank you."*
