import { G1Point, G2Point } from "../crypto/bls/attestation"
import { Address, Bytes as Web3Bytes } from "web3"

// export type Bytes = string;
export type Bytes = Web3Bytes;
export type Web3DefaultNumber = bigint;
export type Uint256 = Web3DefaultNumber;
export type Uint192 = Web3DefaultNumber;
export type Uint128 = Web3DefaultNumber;
export type Uint96 = Web3DefaultNumber;
export type Uint64 = Web3DefaultNumber;
export type Uint32 = Web3DefaultNumber;
export type Uint16 = Web3DefaultNumber;
export type Uint8 = Web3DefaultNumber;
export type OperatorId = string;
export type BlockNumber = Uint32;
export type QuorumNum = Uint8;
export type TaskIndex = Uint32;
export type Exception = { message: string, code: number };
export type LocalAccount = { address: string; privateKey: string }

export type ContractAddresses = {
    registryCoordinator: string,
    operatorStateRetriever: string,
    rewardsCoordinator: string,
    permissionController?: string, // Optional for non-M2 version
    serviceManager: string,
    allocationManager: string,
    delegationManager: string,
    avsAddress: string,
    erc20MockStrategy: string,
}

export type Operator = {
    address: Address,
    earningsReceiverAddress: Address, // default: ""
    stakerOptOutWindowBlocks?: bigint,
    metadataUrl: string, // default: ""
    allocationDelay: Uint32,
    delegationApproverAddress: Address, // default: ""
}

export type OperatorSet = {
    id: Uint32,
    avs: string,
}

export type SlashableStake = {
    operatorSet: OperatorSet,
    strategies: string[],
    operators: string[],
    slashableStakes: Uint256[][]
}

export type OperatorPubkeys = {
    // G1 signatures are used to verify signatures onchain (since G1 is cheaper to verify onchain via precompiles)
    g1PubKey: G1Point,
    // G2 is used to verify signatures offchain (signatures are on G1)
    g2PubKey: G2Point,

}

export type OperatorStateRetrieverOperator = {
    operator: Address,
    operatorId: OperatorId,
    stake: bigint,
}

export type OperatorSetParams = {
    maxOperatorCount: Uint32,
    kickBIPsOfOperatorStake: Uint16,
    kickBIPsOfTotalStake: Uint16,
}

export type StrategyParams = {
    strategy: string,
    multiplier: Uint96,
}

export type RewardsSubmission = {
    strategiesAndMultipliers: StrategyParams[],
    token: string,
    amount: Uint256,
    startTimestamp: Uint32,
    duration: Uint32
}

export type OperatorDirectedRewardsSubmission = Omit<RewardsSubmission, 'amount'> & {
    operatorRewards: {
        operator: string,
        amount: Uint256
    }[],
    description: string
}

export type StakeUpdate = {
    updateBlockNumber: Uint32
    nextUpdateBlockNumber: Uint32
    stake: Uint96
}

export type ApkUpdate = {
    apkHash: Bytes,
    updateBlockNumber: Uint32
    nextUpdateBlockNumber: Uint32
}

export type OperatorInfo = {
    socket: string,
    pubKeys: OperatorPubkeys,
}

export type OperatorAvsState = {
    operatorId: OperatorId,
    operatorInfo: OperatorInfo,
    // Stake of the operator for each quorum
    // Type 'Uint8' does not satisfy the constraint 'string | number | symbol' so we use string instead
    stakePerQuorum: Record<string, bigint>,
    blockNumber: Uint32,
}

export type QuorumAvsState = {
    quorumNumber: Uint8,
    totalStake: bigint,
    aggPubKeyG1: G1Point,
    blockNumber: Uint32,
}

export type OperatorStateRetrieverCheckSignaturesIndices = {
    nonSignerQuorumBitmapIndices: Uint32[],
    quorumApkIndices: Uint32[],
    totalStakeIndices: Uint32[],
    nonSignerStakeIndices: Uint32[][],
}