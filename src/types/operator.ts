import { ethers } from "ethers";
import { G1Point } from "../crypto/bls/attestation.js";

// OperatorIdFromG1Pubkey
export function operatorIdFromG1Pubkey(pubkey: G1Point): string {
    // Convert x and y to 32-byte hex (big-endian, zero-padded)
    const xHex = "0x" + pubkey.getX().getStr(16).padStart(64, "0");
    const yHex = "0x" + pubkey.getY().getStr(16).padStart(64, "0");

    // Concatenate x || y
    const concatenated = ethers.concat([xHex, yHex]);

    // Keccak256 hash
    return ethers.keccak256(concatenated);
}
