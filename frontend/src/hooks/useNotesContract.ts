import { useState, useEffect, useCallback } from 'react';
import { ethers } from 'ethers';
import { useWeb3 } from '../contexts/Web3Context';
import { Note, ContractState } from '../types';

import CONTRACT_ABI from '../contracts/NotesMarketplaceABI.json';

const CONTRACT_ADDRESS = process.env.REACT_APP_CONTRACT_ADDRESS || '0x1153027c523EA4cCb0277c0eBAD03707579D3360';

export function useNotesContract() {
  const { state: web3State, addTransaction, updateTransaction } = useWeb3();
  const [contractState, setContractState] = useState<ContractState>({
    contract: null,
    isLoading: false,
    error: null,
  });

  useEffect(() => {
    if (web3State.isConnected && web3State.account) {
      initializeContract();
    } else {
      setContractState({
        contract: null,
        isLoading: false,
        error: null,
      });
    }
  }, [web3State.isConnected, web3State.account]);

  const initializeContract = async () => {
    try {
      setContractState(prev => ({ ...prev, isLoading: true, error: null }));

      if (!CONTRACT_ADDRESS) {
        throw new Error('Contract address not configured');
      }

      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);

      setContractState({
        contract,
        isLoading: false,
        error: null,
      });
    } catch (error: any) {
      setContractState({
        contract: null,
        isLoading: false,
        error: error.message || 'Failed to initialize contract',
      });
    }
  };

  const createNote = useCallback(async (
    title: string,
    description: string,
    ipfsHash: string,
    price: string,
    subject: string
  ) => {
    if (!contractState.contract) {
      throw new Error('Contract not initialized');
    }

    try {
      // Pre-flight duplicate / copyright check
      try {
        const { notesContract } = await import('../contractConnection');
        const allNotes = await notesContract.getAllNotes();
        const userAddress = (web3State.account || '').toLowerCase();
        const duplicate = allNotes.find((n: any) => {
          if (!n) return false;
          const hashMatch = n.ipfsHash && ipfsHash && n.ipfsHash.trim().toLowerCase() === ipfsHash.trim().toLowerCase();
          const titleMatch = n.title && title && n.title.trim().toLowerCase() === title.trim().toLowerCase();
          return hashMatch || titleMatch;
        });

        if (duplicate) {
          const isOwn = duplicate.author && duplicate.author.toLowerCase() === userAddress;
          if (isOwn) {
            throw new Error(`⚠️ Duplicate Note: You have already uploaded note #${duplicate.id} ("${duplicate.title}").`);
          } else {
            const hasBought = await notesContract.hasUserPurchased(userAddress, duplicate.id);
            if (hasBought) {
              throw new Error(`🚨 Copyright Violation: You purchased this note ("${duplicate.title}") from author ${duplicate.author.slice(0,6)}...${duplicate.author.slice(-4)}. Re-uploading or reselling other creators' study materials is strictly prohibited!`);
            } else {
              throw new Error(`🚨 Copyright Infringement: This note has already been registered on the blockchain by author ${duplicate.author.slice(0,6)}...${duplicate.author.slice(-4)} (Note #${duplicate.id}).`);
            }
          }
        }
      } catch (checkErr: any) {
        if (checkErr.message.includes('Copyright') || checkErr.message.includes('Duplicate')) {
          throw checkErr;
        }
        console.warn('Pre-flight copyright check skipped:', checkErr);
      }

      const priceInWei = ethers.parseEther(price);
      
      // Create metadata URI for the 6th parameter
      const metadata = {
        title,
        description,
        subject,
        ipfsHash,
        createdAt: new Date().toISOString(),
        creator: web3State.account
      };
      const metadataURI = `data:application/json;base64,${btoa(JSON.stringify(metadata))}`;
      
      // Estimate gas with all 6 parameters
      const gasEstimate = await contractState.contract.createNote.estimateGas(
        title,
        description,
        ipfsHash,
        priceInWei,
        subject,
        metadataURI
      );

      // Add 20% buffer to gas estimate
      const gasLimit = (gasEstimate * BigInt(120)) / BigInt(100);

      const tx = await contractState.contract.createNote(
        title,
        description,
        ipfsHash,
        priceInWei,
        subject,
        metadataURI,
        { gasLimit }
      );

      // Add transaction to state
      addTransaction({
        hash: tx.hash,
        type: 'CREATE_NOTE',
        status: 'PENDING',
        timestamp: Date.now(),
      });

      const receipt = await tx.wait();

      // Update transaction status
      updateTransaction(tx.hash, {
        status: 'SUCCESS',
        gasUsed: receipt.gasUsed.toString(),
        gasFee: (receipt.gasUsed * receipt.gasPrice).toString(),
      });

      return receipt;
    } catch (error: any) {
      // Update transaction status if hash exists
      if (error.hash) {
        updateTransaction(error.hash, {
          status: 'FAILED',
        });
      }
      throw error;
    }
  }, [contractState.contract, addTransaction, updateTransaction, web3State.account]);

  const purchaseNote = useCallback(async (tokenId: number, price: string) => {
    if (!contractState.contract) {
      throw new Error('Contract not initialized');
    }

    try {
      const priceInWei = ethers.parseEther(price);
      
      const gasEstimate = await contractState.contract.purchaseNote.estimateGas(
        tokenId,
        { value: priceInWei }
      );

      const gasLimit = (gasEstimate * BigInt(120)) / BigInt(100);

      const tx = await contractState.contract.purchaseNote(tokenId, {
        value: priceInWei,
        gasLimit,
      });

      addTransaction({
        hash: tx.hash,
        type: 'PURCHASE_NOTE',
        status: 'PENDING',
        timestamp: Date.now(),
        noteId: tokenId,
        amount: price,
      });

      const receipt = await tx.wait();

      updateTransaction(tx.hash, {
        status: 'SUCCESS',
        gasUsed: receipt.gasUsed.toString(),
        gasFee: (receipt.gasUsed * receipt.gasPrice).toString(),
      });

      return receipt;
    } catch (error: any) {
      if (error.hash) {
        updateTransaction(error.hash, { status: 'FAILED' });
      }
      throw error;
    }
  }, [contractState.contract, addTransaction, updateTransaction]);

  const rateNote = useCallback(async (tokenId: number, rating: number) => {
    if (!contractState.contract) {
      throw new Error('Contract not initialized');
    }

    try {
      const gasEstimate = await contractState.contract.rateNote.estimateGas(tokenId, rating);
      const gasLimit = (gasEstimate * BigInt(120)) / BigInt(100);

      const tx = await contractState.contract.rateNote(tokenId, rating, { gasLimit });

      addTransaction({
        hash: tx.hash,
        type: 'RATE_NOTE',
        status: 'PENDING',
        timestamp: Date.now(),
        noteId: tokenId,
      });

      const receipt = await tx.wait();

      updateTransaction(tx.hash, {
        status: 'SUCCESS',
        gasUsed: receipt.gasUsed.toString(),
        gasFee: (receipt.gasUsed * receipt.gasPrice).toString(),
      });

      return receipt;
    } catch (error: any) {
      if (error.hash) {
        updateTransaction(error.hash, { status: 'FAILED' });
      }
      throw error;
    }
  }, [contractState.contract, addTransaction, updateTransaction]);

  const updatePrice = useCallback(async (tokenId: number, newPrice: string) => {
    if (!contractState.contract) {
      throw new Error('Contract not initialized');
    }

    try {
      const priceInWei = ethers.parseEther(newPrice);
      const tx = await contractState.contract.updatePrice(tokenId, priceInWei);
      
      const receipt = await tx.wait();
      return receipt;
    } catch (error) {
      throw error;
    }
  }, [contractState.contract]);

  const updateSaleStatus = useCallback(async (tokenId: number, forSale: boolean) => {
    if (!contractState.contract) {
      throw new Error('Contract not initialized');
    }

    try {
      const tx = await contractState.contract.updateSaleStatus(tokenId, forSale);
      const receipt = await tx.wait();
      return receipt;
    } catch (error) {
      throw error;
    }
  }, [contractState.contract]);

  const withdrawEarnings = useCallback(async () => {
    if (!contractState.contract) {
      throw new Error('Contract not initialized');
    }

    try {
      const tx = await contractState.contract.withdrawEarnings();

      addTransaction({
        hash: tx.hash,
        type: 'WITHDRAW',
        status: 'PENDING',
        timestamp: Date.now(),
      });

      const receipt = await tx.wait();

      updateTransaction(tx.hash, {
        status: 'SUCCESS',
        gasUsed: receipt.gasUsed.toString(),
        gasFee: (receipt.gasUsed * receipt.gasPrice).toString(),
      });

      return receipt;
    } catch (error: any) {
      if (error.hash) {
        updateTransaction(error.hash, { status: 'FAILED' });
      }
      throw error;
    }
  }, [contractState.contract, addTransaction, updateTransaction]);

  const getReadContract = useCallback(() => {
    if (contractState.contract) return contractState.contract;
    try {
      const provider = (typeof window !== 'undefined' && window.ethereum)
        ? new ethers.BrowserProvider(window.ethereum)
        : new ethers.JsonRpcProvider('https://ethereum-sepolia-rpc.publicnode.com');
      return new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, provider);
    } catch {
      return null;
    }
  }, [contractState.contract]);

  const formatNoteFromContract = (noteData: any, tokenId?: string | number | bigint): Note => ({
    id: tokenId !== undefined ? Number(tokenId) : Number(noteData.id !== undefined ? noteData.id : 0),
    title: noteData.title !== undefined ? noteData.title : (noteData[0] || ''),
    description: noteData.description !== undefined ? noteData.description : (noteData[1] || ''),
    ipfsHash: noteData.ipfsHash !== undefined ? noteData.ipfsHash : (noteData[2] || ''),
    author: noteData.author !== undefined ? noteData.author : (noteData[3] || ''),
    price: ethers.formatEther(noteData.price !== undefined ? noteData.price : (noteData[4] || 0)),
    forSale: Boolean(noteData.forSale !== undefined ? noteData.forSale : noteData[5]),
    createdAt: Number(noteData.createdAt !== undefined ? noteData.createdAt : (noteData[6] || 0)),
    subject: noteData.subject !== undefined ? noteData.subject : (noteData[7] || ''),
    rating: Number(noteData.rating !== undefined ? noteData.rating : (noteData[8] || 0)),
    ratingCount: Number(noteData.ratingCount !== undefined ? noteData.ratingCount : (noteData[9] || 0)),
    totalRating: Number(noteData.totalRating !== undefined ? noteData.totalRating : (noteData[10] || 0)),
    downloadCount: Number(noteData.downloadCount !== undefined ? noteData.downloadCount : (noteData[11] || 0)),
  });

  const getAllNotes = useCallback(async (): Promise<Note[]> => {
    const contract = contractState.contract || getReadContract();
    if (!contract) {
      throw new Error('Contract not available');
    }

    try {
      const rawIds = await contract.getAllNotes();
      const tokenIds = Array.from(rawIds).map((id: any) => BigInt(id.toString()));
      const notes: Note[] = [];

      try {
        const rawNotes = await contract.getMultipleNotes(tokenIds);
        return Array.from(rawNotes).map((noteData: any, idx: number) => 
          formatNoteFromContract(noteData, tokenIds[idx])
        );
      } catch (err) {
        console.warn('getMultipleNotes failed, fetching individually:', err);
        for (const id of tokenIds) {
          try {
            const noteData = await contract.notes(id);
            notes.push(formatNoteFromContract(noteData, id));
          } catch (error) {
            console.warn(`Failed to fetch note ${id}:`, error);
          }
        }
        return notes;
      }
    } catch (error) {
      console.error('Failed to get all notes:', error);
      return [];
    }
  }, [contractState.contract, getReadContract]);

  const getUserNotes = useCallback(async (userAddress?: string): Promise<Note[]> => {
    const contract = contractState.contract || getReadContract();
    if (!contract) {
      throw new Error('Contract not available');
    }

    const address = userAddress || web3State.account;
    if (!address) {
      return [];
    }

    try {
      if (typeof contract.getNotesByAuthor === 'function') {
        try {
          const rawIds = await contract.getNotesByAuthor(address);
          const noteIds = Array.from(rawIds).map((id: any) => BigInt(id.toString()));
          if (noteIds.length > 0) {
            const notes: Note[] = [];
            for (const id of noteIds) {
              try {
                const noteData = await contract.notes(id);
                notes.push(formatNoteFromContract(noteData, id));
              } catch (error) {
                console.warn(`Failed to fetch note ${id}:`, error);
              }
            }
            return notes;
          }
        } catch (e) {
          console.warn('getNotesByAuthor failed, falling back to filter:', e);
        }
      }

      const allNotes = await getAllNotes();
      return allNotes.filter(
        (n) => n.author && n.author.toLowerCase() === address.toLowerCase()
      );
    } catch (error) {
      console.error('Failed to fetch user notes:', error);
      return [];
    }
  }, [contractState.contract, getReadContract, web3State.account, getAllNotes]);

  const getUserPurchases = useCallback(async (userAddress?: string): Promise<Note[]> => {
    const contract = contractState.contract || getReadContract();
    if (!contract) {
      throw new Error('Contract not available');
    }

    const address = userAddress || web3State.account;
    if (!address) {
      return [];
    }

    try {
      if (typeof contract.getUserPurchases === 'function') {
        try {
          const rawIds = await contract.getUserPurchases(address);
          const noteIds = Array.from(rawIds).map((id: any) => BigInt(id.toString()));
          if (noteIds.length > 0) {
            const notes: Note[] = [];
            for (const id of noteIds) {
              try {
                const noteData = await contract.notes(id);
                notes.push(formatNoteFromContract(noteData, id));
              } catch (error) {
                console.warn(`Failed to fetch purchased note ${id}:`, error);
              }
            }
            return notes;
          }
        } catch (e) {
          console.warn('getUserPurchases call failed:', e);
        }
      }

      // Fallback: check each note against hasPurchased mapping
      const allNotes = await getAllNotes();
      const purchasedNotes: Note[] = [];
      for (const note of allNotes) {
        try {
          const isBought = (typeof contract.hasPurchased === 'function')
            ? await contract.hasPurchased(address, note.id)
            : await contract.hasUserPurchased(address, note.id);
          if (isBought) {
            purchasedNotes.push(note);
          }
        } catch (e) {
          // ignore
        }
      }
      return purchasedNotes;
    } catch (error) {
      console.error('Failed to fetch user purchases:', error);
      return [];
    }
  }, [contractState.contract, getReadContract, web3State.account, getAllNotes]);

  const getAuthorEarnings = useCallback(async (address?: string): Promise<string> => {
    const contract = contractState.contract || getReadContract();
    if (!contract) {
      return '0';
    }

    const authorAddress = address || web3State.account;
    if (!authorAddress) {
      return '0';
    }

    try {
      const earnings = await contract.authorEarnings(authorAddress);
      return ethers.formatEther(earnings);
    } catch (error) {
      console.error('Failed to fetch author earnings:', error);
      return '0';
    }
  }, [contractState.contract, getReadContract, web3State.account]);

  const hasUserPurchased = useCallback(async (tokenId: number | string, userAddress?: string): Promise<boolean> => {
    const contract = contractState.contract || getReadContract();
    if (!contract) {
      return false;
    }

    const address = userAddress || web3State.account;
    if (!address) {
      return false;
    }

    try {
      if (typeof contract.hasPurchased === 'function') {
        return await contract.hasPurchased(address, tokenId);
      }
      if (typeof contract.hasUserPurchased === 'function') {
        return await contract.hasUserPurchased(address, tokenId);
      }
      return false;
    } catch (error) {
      console.warn('Failed to check purchase status:', error);
      return false;
    }
  }, [contractState.contract, getReadContract, web3State.account]);

  const getUserRating = useCallback(async (tokenId: number | string, userAddress?: string): Promise<number> => {
    const contract = contractState.contract || getReadContract();
    if (!contract) return 0;

    const address = userAddress || web3State.account;
    if (!address) return 0;

    try {
      if (typeof contract.userRatings === 'function') {
        const rating = await contract.userRatings(tokenId, address);
        return Number(rating);
      }
      if (typeof contract.getUserRating === 'function') {
        const rating = await contract.getUserRating(address, tokenId);
        return Number(rating);
      }
      return 0;
    } catch (error) {
      console.warn('Failed to check user rating:', error);
      return 0;
    }
  }, [contractState.contract, getReadContract, web3State.account]);

  return {
    ...contractState,
    createNote,
    purchaseNote,
    rateNote,
    getUserRating,
    updatePrice,
    updateSaleStatus,
    withdrawEarnings,
    getAllNotes,
    getUserNotes,
    getMyNotes: getUserNotes,
    getUserPurchases,
    getAuthorEarnings,
    hasUserPurchased,
  };
}
