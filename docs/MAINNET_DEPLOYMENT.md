# Mainnet Deployment & Multi-Sig Treasury Signing Ceremony

This document covers the end-to-end mainnet deployment process and the detailed signing ceremony required to authorize treasury operations with the platform's multi-sig Stellar account.

---

## Overview

The Stargate platform treasury uses a **multi-signature Stellar account** for all on-chain fund movements. No single party can unilaterally authorize a treasury transaction. The signing ceremony is the process by which the required threshold of key custodians co-sign a transaction in a controlled, auditable environment.

**Treasury account configuration:**
- Minimum signers required: **2-of-3** (threshold configurable per environment)
- Key custodians: Treasury Lead, Engineering Lead, Operations Lead
- Signing hardware: Hardware Security Module (HSM) or hardware wallet (Ledger/Trezor)
- Signing environment: air-gapped machine or restricted signing workstation

---

## Pre-Ceremony Checklist

Complete all items before scheduling a signing ceremony. The ceremony must not begin unless all items are checked.

### Identity & Access Verification

- [ ] Verify the identity of each key custodian in person or via a pre-agreed secure video call
- [ ] Confirm each custodian has physical possession of their signing device
- [ ] Confirm each custodian's device PIN/passphrase is known only to them
- [ ] Verify the invite list matches the approved custodian roster stored in the team keybase/wiki
- [ ] Confirm at least one independent witness (legal, finance, or security) is present

### Environment Preparation

- [ ] Use a dedicated signing workstation that has never touched the internet during this session, or an air-gapped laptop booted from a verified read-only OS image
- [ ] Verify the signing binary or script matches the published SHA-256 checksum:
  ```
  sha256sum scripts/sign-treasury-tx.sh
  # Expected hash must be verified against the release tag
  ```
- [ ] Disable all wireless interfaces (Wi-Fi, Bluetooth) on the signing machine
- [ ] Confirm the signing machine's system clock is accurate (NTP sync before air-gapping)
- [ ] Shut down all applications not required for signing

### Transaction Preparation

- [ ] Generate the unsigned XDR transaction on a separate, online machine
- [ ] Print or display the transaction details for all custodians to review:
  - Source account (must match `PLATFORM_TREASURY_PUBLIC_KEY`)
  - Sequence number (verify it matches live account sequence)
  - Operations (type, amount, destination, asset)
  - Fee and time bounds
  - Network passphrase (`Public Global Stellar Network ; September 2015`)
- [ ] Transfer the unsigned XDR to the signing workstation via a read-only medium (USB write-protected, QR code, or printed XDR string)
- [ ] Verify the XDR on the signing machine decodes correctly using the Stellar Laboratory or `stellar-base` CLI before any signing occurs

---

## Signing Ceremony Steps

### Step 1 — Assemble Custodians

1. All participating custodians gather (physically or via a pre-approved secure video bridge).
2. The ceremony facilitator reads the transaction details aloud.
3. Each custodian independently verifies the decoded transaction matches the stated intent.
4. A unanimous verbal confirmation ("I confirm") is required before proceeding.

### Step 2 — First Custodian Signs

1. Custodian 1 connects their hardware device to the signing workstation.
2. Run the signing script or use Stellar Lab to sign the XDR:
   ```
   # Example using stellar-base CLI
   stellar transaction sign \
     --xdr <BASE64_UNSIGNED_XDR> \
     --network mainnet
   ```
3. The hardware device displays the transaction hash — custodian 1 verifies it matches the printed hash before approving on the device.
4. Export the partially-signed XDR.
5. Custodian 1 disconnects their device.

### Step 3 — Second Custodian Signs

1. Custodian 2 connects their hardware device to the **same** signing workstation (without rebooting between signers to preserve the XDR in memory, or transfer via write-protected USB).
2. Custodian 2 independently verifies the decoded transaction and the partial signature.
3. Custodian 2 signs the same XDR, producing the fully-signed transaction (or a second partial signature if a third is required).
4. Export the fully-signed XDR.
5. Custodian 2 disconnects their device.

### Step 4 — (If Required) Third Custodian Signs

Repeat Step 3 for the third custodian when a 3-of-3 threshold is in effect or when the primary custodian is unavailable and the backup is being used.

### Step 5 — Verify Signatures Before Submission

1. On the signing workstation, verify the signed XDR contains the expected number of signatures:
   ```
   stellar transaction decode --xdr <BASE64_SIGNED_XDR>
   # Confirm: signatures array length >= required threshold
   ```
2. Verify each signature's hint maps to a known public key in the treasury account's signer list.
3. Record the final signed XDR in the ceremony log before leaving the room.

### Step 6 — Submit the Transaction

1. Transfer the signed XDR to an internet-connected machine via write-protected USB or secure paste.
2. Submit using Horizon:
   ```
   curl -X POST https://horizon.stellar.org/transactions \
     -d "tx=<URL_ENCODED_SIGNED_XDR>"
   ```
   Or via Stellar Laboratory: **Transactions → Submit Transaction**.
3. Verify the transaction hash on a block explorer (Stellarscan, Stellar.expert).
4. Confirm the operation appeared on the treasury account with the correct sequence number.

---

## Post-Ceremony Checklist

- [ ] Record the successful transaction hash in the ceremony log
- [ ] Update the treasury account sequence number in internal documentation
- [ ] Confirm all custodians have disconnected their devices
- [ ] Verify no private key material remains on the signing workstation (reboot or wipe session)
- [ ] Archive the ceremony log with signatures from all custodians and the witness
- [ ] Notify finance, operations, and security that the ceremony is complete and the transaction is confirmed

---

## Emergency / Key Compromise Procedure

If a custodian device is lost, stolen, or suspected compromised:

1. **Immediately** convene the remaining custodians to initiate a key rotation.
2. Prepare a Stellar `SET_OPTIONS` transaction to remove the compromised signer key and add a replacement.
3. Conduct an emergency signing ceremony with the remaining valid custodians (minimum threshold must still be met).
4. After the rotation, invalidate and re-issue the compromised custodian's device.
5. Document the incident in the security log within 24 hours.

---

## Signer Roster

| Role                | Public Key (first 8 chars) | Device Type | Backup Custodian |
|---------------------|---------------------------|-------------|------------------|
| Treasury Lead       | `GXXXXXX…`                | Ledger Nano | Operations Lead  |
| Engineering Lead    | `GXXXXXX…`                | Trezor T    | Senior Engineer  |
| Operations Lead     | `GXXXXXX…`                | Ledger Nano | Treasury Lead    |

> **Note:** Replace placeholder public keys with actual production keys. Never commit bare private keys or seed phrases to this repository.

---

## Related Documents

- [LAUNCH_RUNBOOK.md](./LAUNCH_RUNBOOK.md) — Full mainnet launch sequence
- [RECOVERY.md](./RECOVERY.md) — Rollback and disaster recovery
- [WEBHOOK_SECURITY.md](./WEBHOOK_SECURITY.md) — Webhook signing and secret rotation
