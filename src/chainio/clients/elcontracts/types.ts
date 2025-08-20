import { KeyPair, PrivateKey } from "../../../crypto/bls/attestation.js"
import { QuorumNum, Uint32 } from "../../../types/general.js"

export type RegistrationRequest = {
    operatorAddress: string,
    avsAddress: string,
    operatorSetIds: Uint32[],
    blsKeyPair: KeyPair,
    socket: string,

    // The following are for registering with churn approval.

    // The private key of the churn approver
    churnApprovalEcdsaPrivateKey?: string,
    // The operators to kick on each quorum
    operatorKickParams?: OperatorKickParam[],
}

// Parameters for removing an operator during churn.
// Used in RegistrationRequest to specify which operator to replace.
export type OperatorKickParam = {
    // Quorum from which to remove the operator.
    quorumNumber: QuorumNum,
    // Address of the operator to be removed.
    operator: string,
}

export type SignatureWithSaltAndExpiry = {
    signature: string,
    salt: string,  // hex string
    expiry: bigint,
}