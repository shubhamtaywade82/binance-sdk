# Gift Card — endpoint map

> Generated from `src/registry/*.endpoints.ts` by `npm run docs:generate` — do not edit by hand.

6 implemented endpoints.

| Operation | Method | Path | Auth | SDK surface |
|---|---|---|---|---|
| `giftCard.createADualTokenGiftCardFixedValueDiscountFeatureTrade` | POST | `/sapi/v1/giftcard/buyCode` | SIGNED | `giftCard.createADualTokenGiftCardFixedValueDiscountFeatureTrade` |
| `giftCard.fetchTokenLimitUserData` | GET | `/sapi/v1/giftcard/buyCode/token-limit` | SIGNED | `giftCard.fetchTokenLimitUserData` |
| `giftCard.createASingleTokenGiftCardUserData` | POST | `/sapi/v1/giftcard/createCode` | SIGNED | `giftCard.createASingleTokenGiftCardUserData` |
| `giftCard.fetchRsaPublicKeyUserData` | GET | `/sapi/v1/giftcard/cryptography/rsa-public-key` | SIGNED | `giftCard.fetchRsaPublicKeyUserData` |
| `giftCard.redeemABinanceGiftCardUserData` | POST | `/sapi/v1/giftcard/redeemCode` | SIGNED | `giftCard.redeemABinanceGiftCardUserData` |
| `giftCard.verifyBinanceGiftCardByGiftCardNumberUserData` | GET | `/sapi/v1/giftcard/verify` | SIGNED | `giftCard.verifyBinanceGiftCardByGiftCardNumberUserData` |
