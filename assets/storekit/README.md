# StoreKit configuration

`AIConcierge.storekit` is an Xcode StoreKit Configuration file. It mirrors the
two subscription products we sell in App Store Connect and lets developers
test the Apple IAP flow inside the iOS Simulator **without** needing a sandbox
tester account or a real Apple Developer setup.

## Why this isn't under `ios/`

The plan originally said `ios/AIConcierge.storekit`, but the `ios/` folder is
gitignored as a generated artifact and `npx expo prebuild --clean` wipes it.
Stashing the file here keeps it safe across prebuilds. Xcode is happy to load
a `.storekit` file from any path — the scheme just needs to reference it.

## Wiring it into Xcode (first-time setup)

After `npx expo prebuild` regenerates `ios/`:

1. `open ios/AIConcierge.xcworkspace` (or `ios/AIConcierge.xcodeproj`).
2. Xcode menu → Product → Scheme → Edit Scheme…
3. Select **Run** in the left pane.
4. **Options** tab → **StoreKit Configuration** dropdown → **Choose…**
5. Navigate to `../assets/storekit/AIConcierge.storekit` and select it.
6. Close the scheme editor.

From here on, running the app in the simulator will use these products
instead of the real App Store. Apple Pay sheets are mocked; transactions
finish instantly.

## Keeping the file in sync with App Store Connect

Whenever you change a price, display name, or product ID in App Store Connect
(`com.daveget.aiconcierge.*`), update the same field here so simulator runs
match what App Review will see. The two sources of truth must agree on:

- `productID` (line up with `Plan.appleProductId` in the backend seed)
- `displayPrice` (line up with `Plan.applePrice` cents in the backend seed)
- `recurringSubscriptionPeriod` (currently `P1M` = 1 month)

The backend's verifier rejects any receipt whose `productId` doesn't match
`Plan.appleProductId`, so a mismatch here surfaces as "Receipt productId X
does not match plan Y" in the app — a useful safety net but a noisy debug
trail. Keep them in lockstep.

## Testing tip

Sandbox subscriptions in **simulator** with this file complete instantly and
auto-renew every **30 seconds** (Apple's accelerated test cadence). So you
can watch a sub renew → expire → cancel in under 5 minutes from a clean
install.
