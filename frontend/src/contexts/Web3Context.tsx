import React, { createContext, useContext, useReducer, useEffect, ReactNode } from 'react';
import { ethers } from 'ethers';
import { Web3State, UserProfile, Transaction } from '../types';

interface Web3ContextType {
  state: Web3State;
  userProfile: UserProfile | null;
  transactions: Transaction[];
  connectWallet: () => Promise<void>;
  disconnectWallet: () => void;
  switchNetwork: (chainId: number) => Promise<void>;
  addTransaction: (transaction: Transaction) => void;
  updateTransaction: (hash: string, updates: Partial<Transaction>) => void;
}

interface AppState {
  web3: Web3State;
  userProfile: UserProfile | null;
  transactions: Transaction[];
}

type AppAction =
  | { type: 'SET_WEB3_STATE'; payload: Partial<Web3State> }
  | { type: 'SET_USER_PROFILE'; payload: UserProfile | null }
  | { type: 'ADD_TRANSACTION'; payload: Transaction }
  | { type: 'UPDATE_TRANSACTION'; payload: { hash: string; updates: Partial<Transaction> } }
  | { type: 'RESET_STATE' };

const initialWeb3State: Web3State = {
  isConnected: false,
  account: null,
  chainId: null,
  balance: null,
  isLoading: false,
  error: null,
};

const initialState: AppState = {
  web3: initialWeb3State,
  userProfile: null,
  transactions: [],
};

function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'SET_WEB3_STATE':
      return {
        ...state,
        web3: { ...state.web3, ...action.payload },
      };
    case 'SET_USER_PROFILE':
      return {
        ...state,
        userProfile: action.payload,
      };
    case 'ADD_TRANSACTION':
      return {
        ...state,
        transactions: [action.payload, ...state.transactions],
      };
    case 'UPDATE_TRANSACTION':
      return {
        ...state,
        transactions: state.transactions.map((tx) =>
          tx.hash === action.payload.hash
            ? { ...tx, ...action.payload.updates }
            : tx
        ),
      };
    case 'RESET_STATE':
      return initialState;
    default:
      return state;
  }
}

const Web3Context = createContext<Web3ContextType | undefined>(undefined);

export function Web3Provider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(appReducer, initialState);

  // Check if wallet is already connected
  useEffect(() => {
    checkConnection();
    setupEventListeners();
  }, []);

  const checkConnection = async () => {
    if (typeof window.ethereum !== 'undefined') {
      try {
        const accounts = await window.ethereum.request({ method: 'eth_accounts' });
        if (accounts.length > 0) {
          await connectWallet();
        }
      } catch (error) {
        console.error('Failed to check wallet connection:', error);
      }
    }
  };

  const setupEventListeners = () => {
    if (typeof window.ethereum !== 'undefined') {
      window.ethereum.on('accountsChanged', handleAccountsChanged);
      window.ethereum.on('chainChanged', handleChainChanged);
      window.ethereum.on('disconnect', handleDisconnect);
    }
  };

  const handleAccountsChanged = async (accounts: string[]) => {
    if (accounts.length === 0) {
      disconnectWallet();
    } else {
      try {
        const provider = new ethers.BrowserProvider(window.ethereum);
        const balance = await provider.getBalance(accounts[0]);
        dispatch({
          type: 'SET_WEB3_STATE',
          payload: { 
            isConnected: true,
            account: accounts[0],
            balance: ethers.formatEther(balance)
          },
        });
        await loadUserProfile(accounts[0]);
      } catch (e) {
        dispatch({
          type: 'SET_WEB3_STATE',
          payload: { isConnected: true, account: accounts[0] },
        });
      }
    }
  };

  const handleChainChanged = (chainId: string) => {
    dispatch({
      type: 'SET_WEB3_STATE',
      payload: { chainId: parseInt(chainId, 16) },
    });
  };

  const handleDisconnect = () => {
    disconnectWallet();
  };

  const connectWallet = async () => {
    if (typeof window.ethereum === 'undefined') {
      dispatch({
        type: 'SET_WEB3_STATE',
        payload: { error: 'MetaMask is not installed' },
      });
      return;
    }

    try {
      dispatch({
        type: 'SET_WEB3_STATE',
        payload: { isLoading: true, error: null },
      });

      // Request account access
      const accounts = await window.ethereum.request({
        method: 'eth_requestAccounts',
      });

      if (accounts.length === 0) {
        throw new Error('No accounts found');
      }

      const provider = new ethers.BrowserProvider(window.ethereum);
      const network = await provider.getNetwork();
      const balance = await provider.getBalance(accounts[0]);

      dispatch({
        type: 'SET_WEB3_STATE',
        payload: {
          isConnected: true,
          account: accounts[0],
          chainId: Number(network.chainId),
          balance: ethers.formatEther(balance),
          isLoading: false,
          error: null,
        },
      });

      // Load user profile
      await loadUserProfile(accounts[0]);
    } catch (error: any) {
      dispatch({
        type: 'SET_WEB3_STATE',
        payload: {
          isLoading: false,
          error: error.message || 'Failed to connect wallet',
        },
      });
    }
  };

  const disconnectWallet = () => {
    dispatch({ type: 'RESET_STATE' });
  };

  const switchNetwork = async (targetChainId: number) => {
    if (typeof window.ethereum === 'undefined') {
      throw new Error('MetaMask is not installed');
    }

    try {
      await window.ethereum.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: `0x${targetChainId.toString(16)}` }],
      });
    } catch (error: any) {
      // If network doesn't exist, add it
      if (error.code === 4902) {
        await addNetwork(targetChainId);
      } else {
        throw error;
      }
    }
  };

  const addNetwork = async (chainId: number) => {
    const networks: { [key: number]: any } = {
      80001: {
        chainId: '0x13881',
        chainName: 'Polygon Mumbai',
        nativeCurrency: {
          name: 'MATIC',
          symbol: 'MATIC',
          decimals: 18,
        },
        rpcUrls: ['https://rpc-mumbai.maticvigil.com'],
        blockExplorerUrls: ['https://mumbai.polygonscan.com'],
      },
      137: {
        chainId: '0x89',
        chainName: 'Polygon',
        nativeCurrency: {
          name: 'MATIC',
          symbol: 'MATIC',
          decimals: 18,
        },
        rpcUrls: ['https://polygon-rpc.com'],
        blockExplorerUrls: ['https://polygonscan.com'],
      },
    };

    const networkConfig = networks[chainId];
    if (!networkConfig) {
      throw new Error('Unsupported network');
    }

    await window.ethereum.request({
      method: 'wallet_addEthereumChain',
      params: [networkConfig],
    });
  };

  const loadUserProfile = async (address: string) => {
    try {
      // This would typically load from your contract or backend
      const profile: UserProfile = {
        name: '',
        bio: '',
        verified: false,
        totalEarnings: '0',
        notesCreated: 0,
        reputation: 0,
      };

      dispatch({
        type: 'SET_USER_PROFILE',
        payload: profile,
      });
    } catch (error) {
      console.error('Failed to load user profile:', error);
    }
  };

  const addTransaction = (transaction: Transaction) => {
    dispatch({
      type: 'ADD_TRANSACTION',
      payload: transaction,
    });
  };

  const updateTransaction = (hash: string, updates: Partial<Transaction>) => {
    dispatch({
      type: 'UPDATE_TRANSACTION',
      payload: { hash, updates },
    });
  };

  const contextValue: Web3ContextType = {
    state: state.web3,
    userProfile: state.userProfile,
    transactions: state.transactions,
    connectWallet,
    disconnectWallet,
    switchNetwork,
    addTransaction,
    updateTransaction,
  };

  return (
    <Web3Context.Provider value={contextValue}>
      {children}
    </Web3Context.Provider>
  );
}

export function useWeb3() {
  const context = useContext(Web3Context);
  if (context === undefined) {
    throw new Error('useWeb3 must be used within a Web3Provider');
  }
  return context;
}

// Extend Window interface for ethereum
declare global {
  interface Window {
    ethereum?: any;
  }
}
