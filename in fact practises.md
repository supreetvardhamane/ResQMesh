# In Fact Practices

Spoken pitch for ResQMesh. About **2 minutes 40 seconds** at a calm pace (roughly 150 words a minute). Say it in plain words. The technical words appear only when the story needs them, and each one is explained the moment it appears.

If a judge cuts in, stop and answer from the second half. Do not defend a claim this page does not make.

---

## The pitch

### 0:00 – 0:30 · The situation

When a flood cuts a district, the phone towers often die within a couple of hours. The person standing in the water still has a charged phone. That phone cannot reach the control room, because a normal app asks the internet for permission before it will even save a request.

Nearby, a neighbour may have a boat. A clinic may have beds. A rescue van may already be on the road. None of them can see each other. ResQMesh is the missing layer between those people. It keeps a help request alive on the phone, carries it through whoever is close, and hands it to the responders as one clear, checkable record.

### 0:30 – 1:05 · What the person does

The trapped person opens the app. There is no account and no one-time password. They choose the need — medical, rescue, food and water, or shelter — how urgent it is, and a rough area, not a precise home address.

They press send. The phone writes the request onto itself first. Before it does that, it seals the request with a signature. A signature here is a lock made on that phone: if anyone later changes the place, the urgency, or the need, the lock no longer matches and the desk rejects it. The screen says the request is saved on this phone. Refresh the page and it is still there. The cloud does not have to be awake for the first step to succeed.

### 1:05 – 1:50 · How the request travels

The request then waits. It moves only when another device is close enough to exchange a small message: the same local Wi-Fi, a rescue vehicle’s radio, and later a phone-to-phone radio. That is the mesh. It is not magic through walls. It is a handshake between devices that can already hear each other.

Each device keeps its own copy until the next one accepts it. That is store-and-forward: carry it, then hand it on. Three rules stop the neighbourhood from drowning in copies. The request can pass at most three times. It expires, in this design after thirty minutes. A phone that has already seen that exact request does not pass it again.

A rescue vehicle is the bridge. When that vehicle reaches any working link — a tower, a satellite, a district office — it delivers the same sealed request to the coordination desk, once. Repeating the journey does not create a second emergency.

### 1:50 – 2:25 · What the responder sees

The desk does not receive a rumour. It receives one request, the proof that it was not edited on the way, how fresh it is, and which nearby thing can help: a boat, an ambulance, beds. The match is a suggestion with a reason. A person still decides. The software does not send a vehicle by itself.

If two reports disagree, both stay on the screen. If a road report grows old and nobody confirms it, its confidence fades, so yesterday’s “this road is clear” does not keep looking like a fact. Confidence here means freshness plus confirmation. It is a clock and a second witness, not a machine guessing the truth.

### 2:25 – 2:50 · The honest close

What you can watch today is that path on a working prototype: save with no internet, carry the request across a local link, accept it once at the desk, and match it to a resource. The radio in this room stands in for the field radio. The rules of the message — the seal, the three hops, the lifetime, the single copy — are the engineering, and those rules stay the same when the radio changes.

ResQMesh does not replace the disaster authority. It gives the last mile a way to speak until the authority can hear.

---

## How the technicality grows

Use this only if they ask “go deeper.” Each line adds one idea. Stop when they are satisfied.

| Minute | Plain fact | The next layer, if they ask |
| --- | --- | --- |
| 0:30 | The request is saved on the phone. | The browser stores it in IndexedDB, so a refresh does not wipe it. Status: saved locally. |
| 0:45 | The phone seals the request. | The seal is Ed25519. The private key stays on the phone. Only the public key travels. A bad seal is rejected. |
| 1:15 | A nearby device accepts a copy. | The handoff is a short conversation: offer, request, push, acknowledge. A local WebSocket stands in for the radio in this demo. |
| 1:30 | Copies do not multiply. | Ceiling of 3 hops, a time limit, and a memory of recent request IDs. The desk write is idempotent: the same ID updates one record. |
| 1:40 | The vehicle delivers it. | The bridge calls the coordination API. PostgreSQL keeps the record. The responder screen is a view of that record, not a second source of truth. |
| 2:05 | A resource is suggested. | Match on need, capability, area, and whether the listing is still fresh. The reason is shown as plain lines. |
| 2:15 | Old news fades. | A fresh road report starts high. With no second confirmation it drops. A responder confirmation brings it back. The number is a freshness signal. |

---

## What occurs, in order

1. The person describes the need, the urgency, and a rough area.
2. The phone creates a device key if it does not have one, seals the request, and stores it locally.
3. The phone shows **saved on this phone**. Delivery has not happened yet. Say that out loud.
4. When a neighbour or a vehicle can hear this phone, the sealed request is copied across.
5. Each hop checks the size, the age, the hop count, and whether this request was already seen.
6. The rescue vehicle stores the receipt. When it has a path to the district system, it submits the same sealed request.
7. The API checks the seal, the shape of the message, and the request ID, then stores one event.
8. The responder opens that event, reads where it came from and how fresh it is, and sees candidate resources.
9. A person assigns help. The assignment is a human action with a written reason.

If no second device is nearby, the request remains on the first phone. That is an honest outcome, and it is still better than a form that refuses to open.

---

## If they say you do not really do all of this

Say this, then stop.

> You are right to separate the path from a finished field network. Today you are looking at the path that has to be true before any radio matters: the request is saved with no internet, it is sealed on the phone, it can be handed to the next device under strict limits, and the desk accepts that same request once and can match it to a resource.
>
> The room uses a local link as the stand-in radio, because a browser is not allowed to run a sleeping Bluetooth mesh. The message rules do not change when that stand-in is replaced by a vehicle radio or a phone radio. We are showing the coordination path. We are not claiming a city is already meshed.

Point at the screen for only these four things: saved locally, the seal, one accepted copy at the desk, and a match with a written reason. If a screen cannot show a step, do not claim that step.

### Built, so you may show it

- One-tap request with no account: need, urgency, rough area.
- Local save that survives a refresh.
- A signature made on the device, checked when the desk accepts the event.
- A relay design with a hop ceiling, a lifetime, and duplicate suppression.
- A desk that stores one event per request ID, lists resources, and records an assignment made by a person.
- A freshness display so an old road report does not look permanent.

### Designed, so you may describe it, and you must label it as next

- Background Bluetooth or Wi-Fi Aware while the phone is locked. A browser cannot do this. A small native helper on the phone would carry the same message.
- Long-range radio such as a village LoRa gateway.
- Official alert-feed onboarding, full login for responders, and a real key office that can revoke a bad device.
- A measured city-scale load test. The shape is built to grow by area. The number of users is not a claim until it is measured.

---

## Cross questions

Answer in two or three sentences. Then offer to show the screen. Do not add a second feature they did not ask about.

### “Peer-to-peer is not feasible.”

It is feasible in the situation we actually use: two devices that can already hear each other, passing one small sealed request, with a hard stop on hops and age. Phone-to-phone across a silent city, with screens locked and no shared radio, is a different product, and we are not claiming it from a browser tab. Disaster meshes that ship today — vehicle Wi-Fi, village radio, phone radios in a native app — all work as store-and-forward. ResQMesh is that pattern plus a checkable request and a responder desk. The demo radio is local on purpose, so the jury can see the handoff without pretending the laptop has a rescue radio.

### “So the phones do not talk to each other by themselves?”

In this prototype, a person can save the request alone, and a nearby node can take a copy when a local link is up. Automatic discovery while the phone is asleep needs a native radio helper. That helper speaks the same message. We put the hard part — seal, identity of the request, hop limit, one record at the desk — in the prototype, and we kept the radio replaceable.

### “What if there is no second phone nearby?”

The request stays on the first phone, still sealed, still visible, ready for the next person or the next vehicle. We never promise delivery. We promise that the request is not lost just because the tower is dead at the moment of sending.

### “WhatsApp, SMS, or a government app already does this.”

Those apps need a tower and a path back to their servers before the first send succeeds. SMS from the government is a siren outward. It does not bring a stranger’s need, a boat, and a freshness mark back to the desk. ResQMesh starts from the opposite end: save first, move locally, deliver when any bridge appears. It is meant to sit in front of the official system, and to hand over in a structured alert, not to replace the control room.

### “Anyone can send a fake emergency.”

Yes. A signature proves the message was not edited. It does not prove the person is who they claim. The desk shows the request as integrity-checked and identity-unverified. Spam is limited in size, in how often a neighbour will forward, in hop count, and in lifetime. The same request ID cannot become a hundred incidents. A human still triages. Production adds device enrolment and revocation for bridges and responders. That is an operations office, and we do not pretend the hackathon built one.

### “A liar can say the road is clear.”

Both reports stay. The screen shows who said it, when, and whether anyone else confirmed it. An old report fades. Nothing in the product tells a driver “this route is safe.” The responder can attach a decision and a reason. The earlier reports remain underneath that decision.

### “This cannot scale to a whole state.”

A flood is many small neighbourhoods, not one group chat. Each phone only forwards inside three hops, so one lane does not shout across the state. The desk stores by incident and by area, and the same request ID writes once. The responder view can be rebuilt from that log. What we owe you next is a published load test. Until then the honest line is: the design avoids a single chat room; the capacity number is not yet measured.

### “Browsers cannot do a real mesh. You faked it.”

The browser is a honest constraint, and we treated it as one. The prototype speaks the relay over a local socket so you can watch offer, copy, and acknowledgement. A field build puts that same socket behind a vehicle radio or a phone radio. Claiming background Bluetooth inside a web page would be the fake. We did not claim it.

### “Why should I trust the match?”

The match is a short list of facts: this need, this capability, this area, this availability time. If the listing is old, it should look old. The responder assigns. The software does not move a vehicle. If the listing feed is empty, the screen should say there is no current match, and the request itself remains.

### “You have no login. That is unsafe.”

For the person in the water, an account is a failure. The emergency path stores as little as possible: need, urgency, rough area, time, and a device public key. Precise address, phone number, and name are not required to raise the request. The unsafe part is the open desk API in this prototype. Responder actions in a deployment sit behind roles. We say that as a gap, because an open demo server is not an open district.

### “What if your server is down?”

The person’s phone still saves and can still hand a copy to a neighbour. The bridge retries when the desk returns. The server improves the shared picture. It is not required for the first save.

### “Is this artificial intelligence deciding who lives?”

No model dispatches help, verifies a person, or closes a request. Any later assist would only draft a summary for a person to accept or ignore. The match you see is a rule over need, capability, area, and freshness.

### “What about battery, and a village with few phones?”

Three hops and a short lifetime exist so a phone is not relaying all night. In a sparse village the mesh is thinner, and the useful node is often the vehicle, the school, or the clinic, not every handset. Where density is low, the product still keeps the request on the first phone until that vehicle arrives. A field trial has to measure delay and battery. We have not published that trial.

### “Who is liable if the request never arrives?”

The product is an aid to the authority, with visible states: saved here, accepted by a neighbour, accepted by a vehicle, accepted by the desk. It does not guarantee a rescue, and the interface must not say “help is on the way” until a person has assigned it. That wording is part of the product, because a false promise is worse than a clear wait.

### “Why is the location so rough?”

A six-character area is about a square kilometre. It is enough to choose a sector and a resource, and it avoids publishing a doorway. Finer location can be a later, consented field for a responder who is already assigned. Early triage does not need the bedroom.

### “This is a student demo with seeded data.”

The flood incident on the desk is a prepared scenario so the story is repeatable. The citizen path still writes a new sealed request on the phone. Seed data is how we show resources and a blocked road without waiting for a real flood. Treat the scenario as a drill, and treat the save-sign-submit path as the software.

---

## Second questions, after they accept the first answer

These are the follow-ups that arrive once the main objection has been granted. Answer the follow-up. Do not reopen the whole pitch.

| They accept… | Then they ask… | Answer |
| --- | --- | --- |
| The radio is a stand-in. | “Then what did you actually invent?” | The invention is the join: save-first SOS, a sealed envelope, a bounded carry, one desk record, a resource reason, and a freshness mark. Each piece exists somewhere else. The failure in a flood is that they do not exist together when the tower is dead. |
| Signature is not identity. | “Then the seal is useless.” | The seal stops a relay from upgrading a normal request into a critical one, or moving the pin. Identity is a separate office: enrol responders and bridges, leave citizens lightweight. Both are needed. Only the first is in the prototype. |
| Delivery is not guaranteed. | “Then the app can still fail the person.” | Yes, if nobody comes within range before the request expires. The failure is visible: it stays saved locally. A normal app fails invisibly, as a spinner, and stores nothing. |
| The human decides. | “Then the software adds delay.” | The delay it removes is the search through rumours. The suggestion is a short list with reasons. Assign is one action. There is no extra committee inside the app. |
| Old reports fade. | “Twenty minutes is arbitrary.” | It is a starting policy for a fast flood, chosen so the screen cannot look certain for an hour. A district can set the window. The principle is the visible drop, and a second witness bringing it back. |
| You will add a native radio. | “The port will break the crypto.” | The radio carries bytes. The seal is checked on the payload, at the desk, with the same rules. A radio change that can break the seal is a radio change we reject. |
| You partition by area. | “A convoy crossing areas loses the picture.” | The vehicle bridge is how a request leaves its three-hop pocket. The desk, once reached, is shared by incident. Local pockets stay small on purpose. |
| No account for citizens. | “Responders will be flooded with noise.” | Urgency, hop limits, and one ID per request cut the noise. The remaining noise is a triage queue with provenance, which is the job the desk already has. Hiding noise by requiring an account hides the real requests too. |
| Demo data is seeded. | “Show me one request that was not seeded.” | Create a new SOS on the citizen screen, refresh, and read the new ID and the saved-local state. Then show the desk accepting a submitted envelope. Keep those two moments distinct if the live link between them is not up. |
| You are not the authority. | “Why will a district install this?” | Because during the blackout their own dashboard is blind, and this gives them a queue they can audit afterwards: who said it, whether it was edited, when it arrived, what was assigned. It can hand over in the alert formats they already know. |

---

## Lines to avoid

Say **saved on this phone**, **handed to the next device**, **accepted once at the desk**, **suggested match**, **freshness**, **prototype radio**.

Leave these sentences unused:

- “It guarantees rescue.”
- “The mesh works with no other device nearby.”
- “We verified who the person is.”
- “Artificial intelligence decided.”
- “This already runs on Bluetooth in the browser.”
- “We tested a billion users.”
- “The road is safe.”
- “Help is on the way,” unless a person has actually assigned it.

---

## If the demo breaks while you are speaking

| What failed | What you say |
| --- | --- |
| The neighbour link drops | “The request is still saved on the first phone. The next device can take it when the link returns.” |
| The desk is down | “Saving and carrying do not wait for the desk. The vehicle submits when the desk returns.” |
| The map is blank | “The area is still written as text. The request does not need the map.” |
| A resource list looks empty | “No fresh resource is listed for this need. The request stays open for a person to handle.” |
