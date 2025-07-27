import { ethers, AbiCoder } from 'ethers';
import { TransactionReceipt, Web3 } from 'web3';
import { AbiItem } from 'web3-utils';
import { LocalAccount, OperatorId, Uint256 } from '../types/general.js';
import { G1Point, G2Point, KeyPair } from '../crypto/bls/attestation.js'
import * as ABIs from '../contracts/ABIs.js'
import pino from 'pino';
import { abiEncodeData, jsonEncode } from '../utils/helpers.js';

const logger = pino({
    level: process.env.LOG_LEVEL || 'info', // Set log level here
    // prettyPrint: { colorize: true }
    transport: {
        target: 'pino-pretty'
    },
});

export function min(...args): bigint {
    if (args.length === 0) 
        throw new Error('No arguments provided for min method');
    if (!args.every(val => typeof val === "bigint")) 
        throw new TypeError('min arguments must be BigInt');
    return args.reduce((min, current) => current < min ? current : min);
}

export function numsToBytes(nums: number[]): Uint8Array {
    const chars: string[] = nums.map(num => String.fromCharCode(num));
    // const chars: string[] = nums.map(num => String.fromCodePoint(num));
    const joinedString: string = chars.join('');
    const bytes: Uint8Array = new TextEncoder().encode(joinedString);
    return bytes;
}

export function bitmapToQuorumIds(bitmap: bigint): number[] {
    const quorumIds: number[] = [];
    let mask = 1n;
    for (let i = 0; i < 256; i++) {
        if (bitmap & mask) {
            quorumIds.push(i);
        }
        mask <<= 1n;
    }
    return quorumIds;
}

export type ContractCallParams = {
    contract: any,
    method: string,
    params: any[],
    // if abi passed, error message can be decoded
    abi?: AbiItem[],
    pkWallet: LocalAccount,
    web3: Web3,
    gasLimit?: number,
    skipEstimation?: boolean
}

export async function sendContractCall(_params: ContractCallParams): Promise<TransactionReceipt> {
    const {
        contract,
        method,
        params,
        abi,
        pkWallet,
        web3,
        gasLimit = 10_000_000,
        skipEstimation = true
    } = _params;

    logger.debug(`eigensdk.chainio.utils.sendContractCall ` + jsonEncode({
        contract: contract.options.address,
        method,
        params
    }))

    try {
        const contractMethod = contract.methods[method](...params)
        const gasPrice = await web3.eth.getGasPrice();
        let gasEstimation = gasLimit;
        if (!skipEstimation) {
            gasEstimation = await contractMethod.estimateGas({ from: pkWallet.address });
        }

        const txParams = {
            data: contractMethod.encodeABI(),
            from: pkWallet.address,
            to: contract.options.address,
            gasPrice: gasPrice,
            gas: gasEstimation
        };

        const signedTx = await web3.eth.accounts.signTransaction(
            txParams,
            pkWallet.privateKey
        );

        // logger.info({
        // 	contractAddress: contract.options.address,
        // 	method,
        // }, `Sending contract call transaction.`)

        const txReceipt = await web3.eth.sendSignedTransaction(signedTx.rawTransaction);
        logger.debug({tx: txReceipt.transactionHash}, `eigensdk.chainio.utils.sendContractCall:${method}`)
        return txReceipt;
    }
    catch (e: any) {
        if(abi && e.signature) {
            const { signature } = e;
            const customErrMsg = decodeCustomError(abi, web3, signature);
            e.customMsg = customErrMsg || "Unknown error."
        }
        logger.debug(e, `ERROR: eigensdk.chainio.utils.sendContractCall:${method}`)
        throw e;
    }
    
}

function decodeCustomError(abi: AbiItem[], web3: Web3, signature: string): string | null {
    const errorABI:any = abi
        .filter(item => item.type === 'error')
        .find(
            (item: any) =>  web3.utils.keccak256(`${item.name}(${item.inputs.map((i: any) => i.type).join(',')})`).slice(0, 10) === signature
        );

    if (errorABI) {
      return errorABI.name
    } else {
      return null
    }
  }

export class Transactor {
    private pkWallet: LocalAccount;
    private ethHttpClient: Web3;
    private gasLimit: number;
    private skipEstimation: boolean;

    constructor(
        pkWallet: LocalAccount,
        ethHttpClient: Web3,
        gasLimit: number = 10_000_000,
        skipEstimation: boolean = true
    ) {
        this.pkWallet = pkWallet;
        this.ethHttpClient = ethHttpClient;
        this.gasLimit = gasLimit;
        this.skipEstimation = skipEstimation;
    }

    async send(contract: any, method: string, params: any[]): Promise<TransactionReceipt> {
        return await sendContractCall({
            contract,
            method,
            params,
            pkWallet: this.pkWallet,
            web3: this.ethHttpClient,
            gasLimit: this.gasLimit,
            skipEstimation: this.skipEstimation
        });
    }
}

// ABI encode normal registration params
export function abiEncodeNormalRegistrationParams(
    registration_type: number,
    socket: string,
    pubkey_reg_params: {
        pubkeyRegistrationSignature: [bigint, bigint];
        pubkeyG1: [bigint, bigint];
        pubkeyG2: [[bigint, bigint], [bigint, bigint]];
    }
): string {
    const abi_type = '(uint8,string,((uint256,uint256),(uint256,uint256),(uint256[2],uint256[2])))';
    const registration_struct = [
        registration_type,
        socket,
        [
            pubkey_reg_params.pubkeyRegistrationSignature,
            pubkey_reg_params.pubkeyG1,
            pubkey_reg_params.pubkeyG2
        ]
    ];


    const encoded = abiEncodeData([abi_type], [registration_struct]);
    
    // The encoder is prepending 32 bytes to the data as if it was used in a dynamic function parameter.
	// This is not used when decoding the bytes directly, so we need to remove it.

    return "0x" + encoded.slice(2 + 64); // Remove first 32 bytes (0x + 32-byte offset)
}

// ABI encode operator AVS registration params
export function abiEncodeOperatorAvsRegistrationParams(
    operator_id: bigint,
    registration_type: number,
    socket: string,
    pubkey_reg_params: [[bigint, bigint], [bigint, bigint], [bigint[], bigint[]]]
): string {
    const type_str = '(uint256,uint8,string,((uint256,uint256),(uint256,uint256),(uint256[2],uint256[2])))';
    const data = [
        operator_id,
        registration_type,
        socket,
        [pubkey_reg_params[0], pubkey_reg_params[1], pubkey_reg_params[2]]
    ];

    const encoded = abiEncodeData([type_str], [data]);
    return "0x" + encoded.slice(2 + 64); // Remove first 32 bytes (0x + 32-byte offset)
}

// Remove duplicate strategies
export function removeDuplicateStrategies(strategies: string[]): string[] {
    if (!strategies || strategies.length === 0) {
        return [];
    }

    const sortedStrategies = [...strategies].sort();
    const uniqueStrategies: string[] = [sortedStrategies[0]];
    let lastElement = sortedStrategies[0];

    for (const strategy of sortedStrategies.slice(1)) {
        if (strategy === lastElement) {
            continue;
        }
        lastElement = strategy;
        uniqueStrategies.push(strategy);
    }

    return uniqueStrategies;
}

export type PubkeyRegistrationParams = {
    pubkeyRegistrationSignature: [bigint, bigint],
    pubkeyG1: [bigint, bigint],
    pubkeyG2: [[bigint, bigint], [bigint, bigint]]
}

// Get pubkey registration params
export async function getPubkeyRegistrationParams(
    web3: Web3,
    registryCoordinatorAddr: string,
    operatorAddress: string,
    blsKeyPair: KeyPair
): Promise<PubkeyRegistrationParams> {
    const registryCoordinator = new web3.eth.Contract(
        ABIs.REGISTRY_COORDINATOR_ABI as AbiItem[],
        registryCoordinatorAddr
    );

    const g1Hash: [Uint256, Uint256] = await registryCoordinator.methods.pubkeyRegistrationMessageHash(operatorAddress).call();
    const g1Point: G1Point = new G1Point(
        g1Hash[0],
        g1Hash[1]
    );

    const signed_msg = blsKeyPair.signHashedToCurveMessage(g1Point);

    const pubkey_reg_params = {
        pubkeyRegistrationSignature: [
            BigInt(signed_msg.getX().getStr()),
            BigInt(signed_msg.getY().getStr())
        ] as [bigint, bigint],
        pubkeyG1: [
            BigInt(blsKeyPair.pubG1.getX().getStr()),
            BigInt(blsKeyPair.pubG1.getY().getStr())
        ] as [bigint, bigint],
        pubkeyG2: [
            [
                BigInt(blsKeyPair.pubG2.getX().get_b().getStr()),
                BigInt(blsKeyPair.pubG2.getX().get_a().getStr()),
            ],
            [
                BigInt(blsKeyPair.pubG2.getY().get_b().getStr()),
                BigInt(blsKeyPair.pubG2.getY().get_a().getStr()),
            ]
        ] as [[bigint, bigint], [bigint, bigint]]
    };

    return pubkey_reg_params;
}

export function loadLocalAccount(ecdsaPrivateKey: string): LocalAccount {
    return {
        address: new ethers.Wallet(ecdsaPrivateKey).address,
        privateKey: ecdsaPrivateKey.replace("0x", ""),
    };
}