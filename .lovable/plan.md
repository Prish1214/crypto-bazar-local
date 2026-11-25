# CDM Deal Journey and Map Placeholder

## What will change
- Give CDM deals a distinct path after escrow is accepted: deposit the exact INR amount at a nearby CDM, upload the receipt, wait for the seller to independently confirm the bank credit, then authorize escrow release with the existing Deal Code.
- Keep disputed deals frozen and completed/cancelled deals terminal; receipt images will never trigger verification or release. CDM deals skip meetup, arrival, and QR steps.
- Replace the current location-only map with a polished “Integrated CDM map coming soon” state. Do not show invented machine locations or imply that nearby locations are verified.
- Add restrained stage-transition and progress animations, with reduced-motion support.

## Safety boundary
New live CDM deals remain disabled until a verified machine directory and banking safeguards are available. The designed flow remains separate and ready for eligible CDM deals, while ordinary in-person meetups remain unchanged.

## Technical details
- Update the existing Deal Room panels and action chooser for explicit CDM deposit, seller bank-credit acknowledgement, and separate Deal Code release.
- Require both a receipt and the seller’s persisted `cdm_verified_at` acknowledgement in the existing protected release endpoint before escrow can be released.
- Update the existing `/cdm-map` screen and shared stylesheet only as needed; no schema or fabricated directory data.

## Validation
- Check the CDM map placeholder and the deal-room states at mobile and desktop sizes.
- Run available type/build checks and inspect the preview build log.
