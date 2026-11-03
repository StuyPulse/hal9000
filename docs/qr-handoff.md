# Offline QR handoff

When the venue Wi-Fi fails, scouts hand their reports to one receiving device by showing an animated QR code. No network, server or pairing is involved. The receiver checks every report, saves it locally, counts it in its own views straight away, and uploads later.

## At the event

1. Before the event, while online: sign every phone in and open the event once. The app now registers each phone's signing key automatically, which is what lets a receiver upload someone else's reports later.
2. Scout: Outbox, then **Share N reports by QR**. All unsent submitted reports are selected by default. Untick any you don't want, then tap **Show QR**.
3. Receiver (master, admin, developer or strategist): More, then **Scan reports from scouts**. Point the camera at the scout's screen. The receiver shows a four-character code and "x of y pieces". When it shows *N saved*, check that the code matches the scout's screen.
4. Scout taps **The receiver has them**. The reports are marked *Shared by QR* and still upload from the scout's phone when it reconnects. Uploading twice is safe.
5. The receiver can move straight to the next scout. Each transfer keeps its own progress, so switching between phones loses nothing.

The website has the same flow at **Scouting forms → QR handoff** (`/scout/qr`). Browsers can share and scan (scanning needs camera permission and HTTPS), but they can't sign reports.

Speed: 60 signed match reports take about 32 frames, which is 8 seconds at the default 4 frames per second. 500 reports take about 238 frames, which is about a minute. If the receiver struggles, choose **Slow** or **Use easier code**, which makes a less dense code with more frames.

## How the transfer works

- **Payload:** a JSON batch `{app:"HAL9000",v:1,reports:[{entry,revision,proof?}]}`, deflated. Each report keeps the existing relay shape, so the submission format, permanent report IDs and revisions are unchanged.
- **Fountain code** (`packages/shared/src/fountain-qr.ts`): the data is cut into 240-byte blocks (110 for the easier code). The sender shows each block once, then an endless stream of random XOR combinations of blocks. Any set of about *k* distinct frames, plus a handful, rebuilds the data, in any order and from any starting point. The receiver solves this by GF(2) elimination as each frame arrives, so its progress count is exact.
- **Frame format:** `H9F1:` followed by base45, so the code uses the QR alphanumeric mode, which holds about a third more than base64. Each frame has an 8-byte transfer ID (a SHA-256 prefix of the data), the length, the block size, a sequence number and a CRC-32. Misread frames are dropped. The rebuilt data must hash to the transfer ID before anything is used.
- **Validation:** each report is checked with the shared native contract and its signature is matched to its content (`packages/shared/src/qr-batch.ts`). One bad report never blocks the rest.
- **Repeat safety:** the receiver keeps reports by ID and revision. A replay changes nothing and never clears an upload acknowledgment. A newer revision replaces an older one, and a conflicting copy of the same revision is refused with the saved copy kept. A device never overwrites its own report from a QR.
- **Stale schedules:** a report whose team or match is not in the receiver's download is kept with a warning instead of being refused, and the server checks it again at upload.

The single-report QR on a report's detail screen still uses the original protocol, so older app builds keep working for one report at a time.

## Uploading what was received

The server only accepts relayed reports that carry the original scout's device signature, and only from master, admin or developer accounts (`/api/mobile/relay`, unchanged). A strategist's device holds and shows received reports but leaves the upload to a master or to the scout. Unsigned reports, including everything shared from a browser, count on the receiver but must be uploaded by the scout's own device.

## Other offline fixes in this change

- App sync stops at the first connection failure and leaves the rest pending, instead of waiting out a timeout per report and marking them failed.
- The Outbox shows one plain state per report: not shared, shared by QR, received by QR, uploaded, or needs attention.
- Website: the service worker no longer goes through the sign-in proxy, which used to redirect it so that offline support never installed for signed-out visitors and depended on a server check for everyone else. Scouting, assignment and schedule pages fall back to their saved copies when the network fails or hangs for 4 seconds, and an unsaved page shows an offline page instead of a browser error. The assignments page saves your assigned forms, with their scripts, for offline use. The upload queue retries every 30 seconds while anything is waiting, because venue Wi-Fi can come back without the browser noticing, and it stops on a dead connection instead of timing out per report.

## Tests

- `apps/mobile/src/core/fountain-qr.test.ts`:
  - base45
  - lossless and lossy decoding at 10–70% frame loss
  - repair-only late starts
  - 500-report batches
  - misreads and foreign frames
  - interleaved transfers and replays
  - invalid reports inside a batch
  - real QR images rendered and read back with jsQR
- `apps/mobile/src/core/qr-share.test.ts`: selection, delivery states, frozen transfers, proof forwarding, receipt rules and roles.
- `apps/web/src/lib/offline-queue-flush.test.ts`: the upload queue loop.
- A browser end-to-end check of `/demo/qr`, run locally and not committed:
  - a fake camera fed an animated code with a third of the frames dropped: 40 reports saved in about 5 seconds, a replay ignored, data kept after reload
  - a shared code decoded off the page's canvas
  - service worker offline and hanging-network fallbacks

## Two-device scan test

Run this on real phones before an event, with Wi-Fi and cellular off on both. Practice mode works on both devices.

1. Scout phone: submit three practice reports, then Outbox, **Share 3 reports by QR**, **Show QR**.
2. Receiver phone: More, **Scan reports from scouts**. Hold the camera 20–40 cm from the scout's screen. It should finish in a few seconds and show *3 saved*, with the same four-character code as the scout's screen.
3. Keep scanning the same code. The receiver should say the reports are already saved, and its count should not change.
4. Scout taps **The receiver has them**. The Outbox shows *Shared by QR*.
5. Start scanning partway through a fresh transfer, cover the camera for a second, and turn the receiver away and back. It should still finish.
6. Repeat at **Fast**, in bright light, and with the scout's screen brightness turned down. If a combination is slow, try **Use easier code**.
7. Submit 30 or more reports and share them all at once. Note how long the scan takes.
8. Turn Wi-Fi back on. On a signed-in master phone, **Upload received reports**, then check the website shows exactly one copy of each report.

## Not verified yet

- Real camera scanning between two physical phones, especially Android camera throughput and screen glare. This needs real devices.
- Android runtime: no Android SDK or emulator is installed on this machine. Android is checked by export only.
- A live upload of relayed reports against the production server.
- Web scanning on iOS Safari and on Android Chrome.
