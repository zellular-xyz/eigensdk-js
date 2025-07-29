import * as fs from 'fs';
import * as yaml from 'js-yaml';
import { BuildAllConfig, Clients, buildAll } from '../chainio/clients/builder';


export type TestConfigs = {
    operator_address_1: string,
    operator_address_2: string,
    operator_address_3: string,

    avs_registry_coordinator_address: string,
    operator_state_retriever_address: string,
    rewards_coordinator_address: string,
    permission_controller_address: string,
    service_manager_address: string,
    allocation_manager_address: string,
    delegation_manager_address: string,
    avs_address: string,

    eth_rpc_url: string,
    eth_ws_url: string,

    ecdsa_private_key_1: string,
    ecdsa_private_key_2: string,
    ecdsa_private_key_3: string,

    ecdsa_private_key_store_path: string,
    strategy_addr: string,
    [key: string]: any,
}

// Read and parse the YAML configuration file
const config: TestConfigs = yaml.load(fs.readFileSync('./config/anvil.yaml', 'utf8')) as TestConfigs;

// Initialize BuildAllConfig
const cfg = new BuildAllConfig({
    avsName: 'incredible-squaring',
    ethHttpUrl: config.eth_rpc_url,
    registryCoordinatorAddr: config.avs_registry_coordinator_address,
    operatorStateRetrieverAddr: config.operator_state_retriever_address,
    rewardsCoordinatorAddr: config.rewards_coordinator_address,
    permissionControllerAddr: config.permission_controller_address,
    serviceManagerAddr: config.service_manager_address,
    allocationManagerAddr: config.allocation_manager_address,
    delegationManagerAddr: config.delegation_manager_address
});

async function buildClients() {
    // Build array of Clients instances
    const clientsArray: Clients[] = [];
    for (let i = 0; i < 3; i++) {
        clientsArray.push(await buildAll(cfg, config[`ecdsa_private_key_${i + 1}`]));
    }

    return clientsArray
}

export { config, buildClients };