# Demo Script

## Demo Preparation Phases

### Phase 1: Story and proof design, before Phase 2 of implementation

Lock the narrative to the four real failure modes: connectivity, visibility, static maps, and trust. For every spoken sentence, identify the exact screen, log, or test that proves it. Remove features that cannot be demonstrated reliably or connected to a judging criterion.

**Gate:** one storyboard connects problem -> offline SOS -> relay -> bridge -> responder coordination -> trust -> scale/accessibility.

### Phase 2: Instrument the product, during coordination build

Make the demo states observable: local save, relay hop, duplicate suppression, bridge receipt, server sync, resource availability, conflict, and retry. Prepare synthetic fixtures and a one-click reset. Do not let a presenter depend on hidden devtools to explain a core feature.

**Gate:** each on-screen state has plain-language copy and a defined recovery path.

### Phase 3: Accessibility and failure rehearsal, after integration

Run the story at mobile width and keyboard-only. Disable network, fail the bridge/API, and hide the map/AI capability. Confirm the narration still works and clearly describes the degraded outcome.

**Gate:** no single optional dependency can break the SOS story.

### Phase 4: Presentation lock, final 45 minutes

Run the exact five-minute sequence twice using final data and devices. Freeze the route and wording; accept only demo-protecting fixes afterward. Pair a presenter with a backup operator who can restore fixture state without disrupting the room.

**Gate:** two consecutive successful runs and a current backup recording.

## Setup

Use one preloaded flood incident: one blocked road, a hospital with capacity, an ambulance, a shelter, and one bridge node. Begin in offline mode. Keep a resettable fixture and a backup screen recording, but present the live path first.

## Five-minute walkthrough

1. **Problem, 0:00-0:35.** "When a flood breaks the internet, a working phone may still be unable to send SOS, responders cannot see available capacity, static routes become unsafe, and conflicting reports break trust."
2. **Offline SOS, 0:35-1:20.** Create a medical SOS on the citizen PWA. Point out that it is saved locally without login or internet, signed, prioritized, and queued for relay.
3. **Mesh and bridge, 1:20-2:05.** Connect the simulated nearby phone and bridge. Show hop count/relay state, a single delivered event after duplicate suppression, then bridge synchronization when the route returns.
4. **Coordination graph, 2:05-3:00.** Open the responder view. Show the SOS, hospital beds, ambulance, blocked road, and candidate match. Explain the matching fields: need, capability, location, availability, assignment.
5. **Trust and Confidence Decay, 3:00-3:40.** Open a fresh blocked-road report at 94% confidence: bright red and solid. Advance the demo clock to 20 minutes; the marker dims to amber and 60%. Send a responder "still blocked" corroboration; the marker returns to bright red at 94% with a short pulse. "We do not turn reports into permanent facts. The system makes uncertainty visible until the field reconfirms it."
6. **Scale and interoperability, 3:40-4:25.** Show the architecture: local mesh continues independently, bridges submit immutable idempotent events, regional streams partition by geography, and CAP/GeoJSON connect external systems. State clearly that this is a scalable design, not a billion-concurrent prototype claim.
7. **Accessibility and impact, 4:25-5:00.** Show mobile layout, icon plus text status, keyboard focus, and reduced-motion-safe status. End: "When centralized infrastructure fails, the community becomes part of the infrastructure."

## Demo recovery

- Relay fails: show the saved `SAVED_LOCAL` or `RETRY_PENDING` state and retry path.
- API fails: show locally durable event and bridge retry queue.
- Map fails: continue with locality/geohash text; SOS remains usable.
- AI fails: show deterministic manual classification; emergency flow remains unaffected.
- Confidence display fails: retain source/time and trust state; do not hide the underlying observation or claim it is fresh.

## Presenter cues and evidence table

| Moment | On-screen proof | Spoken claim boundary |
| --- | --- | --- |
| Offline creation | disabled network indicator, persisted queue item | "Saved locally" only, not "delivered" |
| Peer relay | peer/bridge receipt and event ID | prototype Wi-Fi/LAN adapter, not native BLE claim |
| Duplicate control | same event ID, one responder event | bounded dedupe works in this scenario |
| Resource match | need, resource, availability, rationale | suggestion for responder review, not automatic dispatch |
| Trust | source, time, corroboration/conflict | evidence-aware, not absolute truth |
| Scale | partitioned architecture diagram | designed to scale; load claims require published test |
| Interoperability | CAP/GeoJSON request/response sample | validated boundary, not universal agency integration |
| Accessibility | mobile, focus, icon plus text status | baseline implemented/tested evidence only |

## Exact operator sequence

1. Start from a reset synthetic flood incident and verify the version banner/configuration.
2. Turn off the external API connection or use the product's explicit offline toggle.
3. On the citizen screen, choose Medical help, add a locality/approximate location, select critical priority, and create SOS.
4. Refresh the page once. Open the queue and show the stable event ID, `SAVED_LOCAL` state, and retry metadata.
5. Enable the peer simulator. Show event transfer to Phone B and then a rescue vehicle bridge; attempt duplicate transfer and point out the single canonical event.
6. Enable bridge sync. Switch to responder console, find the event through the incident feed, and open its provenance panel.
7. Register/show ambulance and hospital capacity. Open candidate match and read its factual rationale aloud.
8. Introduce a blocked-road report and a conflicting update. Show that the system preserves both and avoids confident route language.
9. Open the architecture/interop proof, then the responsive/keyboard evidence.
10. Reset the fixture only after the judge questions, not during the active walkthrough.

## Presenter language guardrails

Say "prototype transport," "simulated peer," "candidate match," "evidence state," and "scaling architecture". Do not say "guaranteed delivery," "verified truth," "AI decides," "real-time everywhere," "works without any peer," or "supports a billion users today." Credibility is stronger than theater here.

## Pre-demo checklist

- [ ] Known device/browser pair tested and charger/network fallback available.
- [ ] Fixture IDs, seed resources, and blocked-road conflict are visible.
- [ ] Offline state and bridge state can be toggled without editing code.
- [ ] Console/log windows are closed or scrubbed of any secret/sensitive data.
- [ ] Mobile viewport, keyboard focus, and reduced-motion setting are prepared.
- [ ] Backup recording matches the current build and is only used after a transparent note.
- [ ] Every visible metric has a source or is marked illustrative.
