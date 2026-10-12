// Network configurations for the decentralized notes marketplace
export const SUPPORTED_NETWORKS = {
  localhost: {
    chainId: 1337,
    chainIdHex: '0x539',
    name: 'Localhost',
    displayName: 'Local Hardhat',
    rpcUrl: 'http://127.0.0.1:8545',
    blockExplorer: 'http://localhost:8545',
    currency: {
      name: 'Ethereum',
      symbol: 'ETH',
      decimals: 18
    },
    testnet: true,
    faucets: []
  },
  sepolia: {
    chainId: 11155111,
    chainIdHex: '0xaa36a7',
    name: 'sepolia',
    displayName: 'Sepolia Testnet',
    rpcUrl: 'https://ethereum-sepolia-rpc.publicnode.com',
    blockExplorer: 'https://sepolia.etherscan.io',
    currency: {
      name: 'Ethereum',
      symbol: 'ETH',
      decimals: 18
    },
    testnet: true,
    faucets: [
      'https://sepoliafaucet.com',
      'https://www.infura.io/faucet/sepolia',
      'https://faucet.quicknode.com/ethereum/sepolia',
      'https://faucets.chain.link/sepolia'
    ]
  },
  mumbai: {
    chainId: 80001,
    chainIdHex: '0x13881',
    name: 'mumbai',
    displayName: 'Polygon Mumbai',
    rpcUrl: 'https://rpc-mumbai.maticvigil.com',
    blockExplorer: 'https://mumbai.polygonscan.com',
    currency: {
      name: 'Matic',
      symbol: 'MATIC',
      decimals: 18
    },
    testnet: true,
    faucets: [
      'https://faucet.polygon.technology',
      'https://mumbaifaucet.com'
    ]
  }
};

// Get current network based on environment
export const getCurrentNetwork = () => {
  const chainId = parseInt(process.env.REACT_APP_CHAIN_ID || '1337');
  const networkKey = Object.keys(SUPPORTED_NETWORKS).find(
    key => SUPPORTED_NETWORKS[key].chainId === chainId
  );
  return networkKey ? SUPPORTED_NETWORKS[networkKey] : SUPPORTED_NETWORKS.localhost;
};

// Get contract address based on current network
export const getContractAddress = () => {
  return process.env.REACT_APP_CONTRACT_ADDRESS || "0x5FbDB2315678afecb367f032d93F642f64180aa3";
};

// Network switching utility
export const switchToNetwork = async (networkKey) => {
  if (!window.ethereum) {
    throw new Error('MetaMask not installed');
  }

  const network = SUPPORTED_NETWORKS[networkKey];
  if (!network) {
    throw new Error(`Unsupported network: ${networkKey}`);
  }

  try {
    // Try to switch to the network
    await window.ethereum.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: network.chainIdHex }],
    });
  } catch (switchError) {
    // If network doesn't exist, add it
    if (switchError && switchError.code === 4902) {
      try {
        await window.ethereum.request({
          method: 'wallet_addEthereumChain',
          params: [{
            chainId: network.chainIdHex,
            chainName: network.displayName,
            nativeCurrency: network.currency,
            rpcUrls: [network.rpcUrl],
            blockExplorerUrls: [network.blockExplorer]
          }]
        });
      } catch (addError) {
        throw new Error(`Failed to add network: ${addError.message}`);
      }
    } else {
      const msg = switchError && switchError.message ? switchError.message : 'Unknown error';
      throw new Error(`Failed to switch network: ${msg}`);
    }
  }
};

// Network validation
export const isValidNetwork = (chainId) => {
  return Object.values(SUPPORTED_NETWORKS).some(network => network.chainId === chainId);
};

// Get network by chain ID
export const getNetworkByChainId = (chainId) => {
  const networkKey = Object.keys(SUPPORTED_NETWORKS).find(
    key => SUPPORTED_NETWORKS[key].chainId === chainId
  );
  return networkKey ? SUPPORTED_NETWORKS[networkKey] : null;
};

// Format transaction URL for block explorer
export const getTxUrl = (txHash, chainId) => {
  const network = chainId ? getNetworkByChainId(chainId) : getCurrentNetwork();
  if (!network) return '#';
  return `${network.blockExplorer}/tx/${txHash}`;
};

// Format address URL for block explorer
export const getAddressUrl = (address, chainId) => {
  const network = chainId ? getNetworkByChainId(chainId) : getCurrentNetwork();
  if (!network) return '#';
  return `${network.blockExplorer}/address/${address}`;
};

export default {
  SUPPORTED_NETWORKS,
  getCurrentNetwork,
  getContractAddress,
  switchToNetwork,
  isValidNetwork,
  getNetworkByChainId,
  getTxUrl,
  getAddressUrl
};
