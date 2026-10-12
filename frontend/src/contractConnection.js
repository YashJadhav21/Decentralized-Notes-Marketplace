/* global BigInt */
// 🚀 CONTRACT CONNECTION COMPONENT - SEPOLIA DEPLOYMENT
// Your contract: 0x34FC410F17117e620B0C80EE5f4419B2658Ab5DC

import { ethers } from 'ethers';
import CONTRACT_ABI from './contracts/NotesMarketplaceABI.json';

// ============ CONTRACT CONFIGURATION ============

export const CONTRACT_ADDRESS = process.env.REACT_APP_CONTRACT_ADDRESS || "0x1153027c523EA4cCb0277c0eBAD03707579D3360";
export const NETWORK_ID = parseInt(process.env.REACT_APP_NETWORK_ID || '11155111'); // Sepolia
export const NETWORK_NAME = process.env.REACT_APP_NETWORK_NAME || "sepolia";
export { CONTRACT_ABI };

// ============ CONTRACT CONNECTION CLASS ============

export class NotesMarketplaceContract {
  constructor() {
    this.contract = null;
    this.signer = null;
    this.provider = null;
    this.setupAccountChangeListener();
  }

  setupAccountChangeListener() {
    if (typeof window !== 'undefined' && window.ethereum && window.ethereum.on) {
      window.ethereum.on('accountsChanged', (accounts) => {
        console.log('🔄 MetaMask account switched:', accounts[0]);
        this.contract = null;
        this.signer = null;
        this.provider = null;
      });
      window.ethereum.on('chainChanged', () => {
        this.contract = null;
        this.signer = null;
        this.provider = null;
      });
    }
  }

  // Get active signer contract (always bound to the current MetaMask active account)
  async getSignerContract() {
    if (typeof window === 'undefined' || !window.ethereum) {
      throw new Error("MetaMask is not installed. Please install MetaMask to interact with the blockchain.");
    }

    await window.ethereum.request({ method: 'eth_requestAccounts' });
    this.provider = new ethers.BrowserProvider(window.ethereum);
    this.signer = await this.provider.getSigner();
    this.contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, this.signer);

    // Verify network
    const network = await this.provider.getNetwork();
    if (Number(network.chainId) !== NETWORK_ID) {
      await this.switchToSepolia();
      this.provider = new ethers.BrowserProvider(window.ethereum);
      this.signer = await this.provider.getSigner();
      this.contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, this.signer);
    }

    return this.contract;
  }

  // Initialize connection
  async connect() {
    try {
      await this.getSignerContract();
      const currentAddress = await this.signer.getAddress();
      console.log("✅ Connected to NotesMarketplace on Sepolia with account:", currentAddress);
      console.log("📍 Contract Address:", CONTRACT_ADDRESS);
      return true;
    } catch (error) {
      console.error("❌ Connection failed:", error);
      return false;
    }
  }

  // Switch to Sepolia network
  async switchToSepolia() {
    try {
      await window.ethereum.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: '0xAA36A7' }], // Sepolia chain ID in hex
      });
    } catch (error) {
      // If network doesn't exist, add it
      if (error.code === 4902) {
        await window.ethereum.request({
          method: 'wallet_addEthereumChain',
          params: [{
            chainId: '0xAA36A7',
            chainName: 'Sepolia Test Network',
            nativeCurrency: {
              name: 'ETH',
              symbol: 'ETH',
              decimals: 18
            },
            rpcUrls: ['https://ethereum-sepolia-rpc.publicnode.com'],
            blockExplorerUrls: ['https://sepolia.etherscan.io/']
          }]
        });
      }
    }
  }

  // ============ CONTRACT FUNCTIONS ============

  // Get contract info
  async getContractInfo() {
    const contract = this.getReadContract();
    
    const name = await contract.name();
    const symbol = await contract.symbol();
    const totalNotes = await contract.getTotalNotes();
    let fee = "250";
    try {
      if (typeof contract.platformFee === 'function') {
        const rawFee = await contract.platformFee();
        fee = rawFee.toString();
      } else if (typeof contract.PLATFORM_FEE_BASIS_POINTS === 'function') {
        const rawFee = await contract.PLATFORM_FEE_BASIS_POINTS();
        fee = rawFee.toString();
      }
    } catch (e) {
      console.warn("Could not read platform fee:", e);
    }
    
    return {
      name,
      symbol,
      totalNotes: totalNotes.toString(),
      platformFee: fee,
      address: CONTRACT_ADDRESS
    };
  }

  // Create a new note
  async createNote(title, description, ipfsHash, price, subject, metadataURI) {
    const contract = await this.getSignerContract();
    const currentAccount = (await this.signer.getAddress()).toLowerCase();

    // Verify against on-chain duplicates & copyright infringement
    try {
      const allNotes = await this.getAllNotes();
      const duplicateNote = allNotes.find(n => {
        if (!n) return false;
        const hashMatch = n.ipfsHash && ipfsHash && n.ipfsHash.trim().toLowerCase() === ipfsHash.trim().toLowerCase();
        const titleMatch = n.title && title && n.title.trim().toLowerCase() === title.trim().toLowerCase();
        return hashMatch || titleMatch;
      });

      if (duplicateNote) {
        const isAuthor = duplicateNote.author && duplicateNote.author.toLowerCase() === currentAccount;
        if (isAuthor) {
          throw new Error(`⚠️ Duplicate Note: You have already uploaded this note (ID: #${duplicateNote.id}, Title: "${duplicateNote.title}"). You cannot upload the same document twice.`);
        } else {
          const hasPurchased = await this.hasUserPurchased(currentAccount, duplicateNote.id);
          if (hasPurchased) {
            throw new Error(`🚨 Copyright Violation: You purchased this note (ID: #${duplicateNote.id}, Title: "${duplicateNote.title}") from original author ${duplicateNote.author.slice(0,6)}...${duplicateNote.author.slice(-4)}. Re-uploading or reselling other creators' notes is strictly prohibited!`);
          } else {
            throw new Error(`🚨 Copyright Infringement: This document is already published on the blockchain by original author ${duplicateNote.author.slice(0,6)}...${duplicateNote.author.slice(-4)} (Note #${duplicateNote.id}). Duplicate uploads are prohibited.`);
          }
        }
      }
    } catch (checkErr) {
      if (checkErr.message.includes('Copyright') || checkErr.message.includes('Duplicate')) {
        throw checkErr;
      }
      console.warn("Pre-upload duplicate check skipped:", checkErr);
    }

    const priceInWei = ethers.parseEther(price.toString());
    const tx = await contract.createNote(
      title,
      description,
      ipfsHash,
      priceInWei,
      subject,
      metadataURI
    );
    
    const receipt = await tx.wait();
    console.log("✅ Note created! Transaction:", receipt.hash);
    return receipt;
  }

  // Purchase a note
  async purchaseNote(tokenId, price) {
    const contract = await this.getSignerContract();
    const buyerAddress = await this.signer.getAddress();
    console.log(`🛒 Purchasing note #${tokenId} with active MetaMask account:`, buyerAddress);

    // Verify on-chain note author
    const note = await contract.notes(tokenId);
    const authorAddress = (note.author !== undefined ? note.author : note[3]).toLowerCase();
    if (authorAddress === buyerAddress.toLowerCase()) {
      throw new Error(`Cannot buy your own note! You are currently connected with ${buyerAddress.slice(0, 6)}...${buyerAddress.slice(-4)}, which is the creator account for this note.`);
    }

    // Check balance of buyer account
    const balance = await this.provider.getBalance(buyerAddress);
    const priceInWei = ethers.parseEther(price.toString());
    if (balance < priceInWei) {
      const balanceEth = ethers.formatEther(balance);
      throw new Error(
        `Insufficient SepoliaETH in ${buyerAddress.slice(0, 6)}...${buyerAddress.slice(-4)}. Your balance is ${parseFloat(balanceEth).toFixed(4)} ETH, but the note costs ${price} ETH + gas fee. Please send at least 0.005 SepoliaETH from Account 1 to this account.`
      );
    }

    const tx = await contract.purchaseNote(tokenId, {
      value: priceInWei
    });
    
    const receipt = await tx.wait();
    console.log("✅ Note purchased! Transaction:", receipt.hash);
    return receipt;
  }

  // Rate a note
  async rateNote(tokenId, rating) {
    const contract = await this.getSignerContract();
    
    const tx = await contract.rateNote(tokenId, rating);
    const receipt = await tx.wait();
    console.log("✅ Note rated! Transaction:", receipt.hash);
    return receipt;
  }

  // Helper to get a read contract instance (read-only fallback if wallet not connected)
  getReadContract() {
    if (this.contract) return this.contract;
    try {
      const provider = (typeof window !== 'undefined' && window.ethereum)
        ? new ethers.BrowserProvider(window.ethereum)
        : new ethers.JsonRpcProvider('https://ethereum-sepolia-rpc.publicnode.com');
      return new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, provider);
    } catch (e) {
      console.warn("Could not create fallback provider:", e);
      return this.contract;
    }
  }

  // Helper to format a Note struct from the contract
  formatNote(note, tokenId) {
    const id = (tokenId !== undefined && tokenId !== null)
      ? tokenId.toString()
      : ((note.id !== undefined && note.id !== null) ? note.id.toString() : '');

    return {
      id,
      title: note.title !== undefined ? note.title : (note[0] || ''),
      description: note.description !== undefined ? note.description : (note[1] || ''),
      ipfsHash: note.ipfsHash !== undefined ? note.ipfsHash : (note[2] || ''),
      author: note.author !== undefined ? note.author : (note[3] || ''),
      price: ethers.formatEther(note.price !== undefined ? note.price : (note[4] || 0)),
      forSale: Boolean(note.forSale !== undefined ? note.forSale : note[5]),
      createdAt: new Date(Number(note.createdAt !== undefined ? note.createdAt : (note[6] || 0)) * 1000),
      subject: note.subject !== undefined ? note.subject : (note[7] || ''),
      averageRating: Number(note.rating !== undefined ? note.rating : (note[8] || 0)),
      ratingCount: (note.ratingCount !== undefined ? note.ratingCount : (note[9] || 0)).toString(),
      totalRating: (note.totalRating !== undefined ? note.totalRating : (note[10] || 0)).toString(),
      downloadCount: (note.downloadCount !== undefined ? note.downloadCount : (note[11] || 0)).toString()
    };
  }

  // Get all notes
  async getAllNotes() {
    try {
      const contract = this.getReadContract();
      if (!contract) return [];

      const rawIds = await contract.getAllNotes();
      // Ensure we convert frozen Result to a standard mutable array of BigInts
      const tokenIds = Array.from(rawIds).map(x => BigInt(x.toString()));
      if (tokenIds.length === 0) return [];

      let rawNotes = [];
      let canUseBatch = true;
      try {
        rawNotes = await contract.getMultipleNotes(tokenIds);
      } catch (err) {
        console.warn("getMultipleNotes failed, querying notes individually:", err);
        canUseBatch = false;
      }

      if (canUseBatch && rawNotes && rawNotes.length === tokenIds.length) {
        return rawNotes.map((note, index) => this.formatNote(note, tokenIds[index]));
      }

      const notes = [];
      for (const id of tokenIds) {
        try {
          const n = await contract.notes(id);
          notes.push(this.formatNote(n, id));
        } catch (e) {
          console.warn(`Failed to fetch note ${id}:`, e);
        }
      }
      return notes;
    } catch (error) {
      console.error("Error fetching notes in contractConnection:", error);
      return [];
    }
  }

  // Get notes created by author
  async getUserNotes(authorAddress) {
    try {
      const contract = this.getReadContract();
      if (!contract) return [];

      const targetAddress = authorAddress || (this.signer ? await this.signer.getAddress() : null);
      if (!targetAddress) return [];

      let tokenIds = [];
      if (typeof contract.getNotesByAuthor === 'function') {
        try {
          const rawIds = await contract.getNotesByAuthor(targetAddress);
          tokenIds = Array.from(rawIds).map(x => BigInt(x.toString()));
        } catch (err) {
          console.warn("getNotesByAuthor failed, falling back to all notes filter:", err);
        }
      }

      if (tokenIds.length > 0) {
        let rawNotes = [];
        let canUseBatch = true;
        try {
          rawNotes = await contract.getMultipleNotes(tokenIds);
        } catch (err) {
          canUseBatch = false;
        }

        if (canUseBatch && rawNotes && rawNotes.length === tokenIds.length) {
          return rawNotes.map((note, index) => this.formatNote(note, tokenIds[index]));
        }

        const notes = [];
        for (const id of tokenIds) {
          try {
            const n = await contract.notes(id);
            notes.push(this.formatNote(n, id));
          } catch (e) {
            console.warn(`Failed to fetch note ${id}:`, e);
          }
        }
        return notes;
      }

      // Fallback: fetch all notes and filter by author
      const allNotes = await this.getAllNotes();
      return allNotes.filter(
        n => n.author && n.author.toLowerCase() === targetAddress.toLowerCase()
      );
    } catch (error) {
      console.error("Error fetching user notes in contractConnection:", error);
      return [];
    }
  }

  async getMyNotes(authorAddress) {
    return this.getUserNotes(authorAddress);
  }

  // Get note details
  async getNoteDetails(tokenId) {
    const contract = this.getReadContract();
    if (!contract) throw new Error("Contract not available");
    
    const note = await contract.getNoteDetails(tokenId);
    return this.formatNote(note, tokenId);
  }

  // Get notes purchased by user
  async getUserPurchases(userAddress) {
    try {
      const contract = this.getReadContract();
      if (!contract) return [];

      const targetAddress = userAddress || (this.signer ? await this.signer.getAddress() : null);
      if (!targetAddress) return [];

      let tokenIds = [];
      if (typeof contract.getUserPurchases === 'function') {
        try {
          const rawIds = await contract.getUserPurchases(targetAddress);
          tokenIds = Array.from(rawIds).map(x => BigInt(x.toString()));
        } catch (err) {
          console.warn("getUserPurchases call failed:", err);
        }
      }

      if (tokenIds.length > 0) {
        const notes = [];
        for (const id of tokenIds) {
          try {
            const n = await contract.notes(id);
            notes.push(this.formatNote(n, id));
          } catch (e) {
            console.warn(`Failed to fetch purchased note ${id}:`, e);
          }
        }
        return notes;
      }

      // Fallback: check each note against hasPurchased mapping
      const allNotes = await this.getAllNotes();
      const purchased = [];
      for (const note of allNotes) {
        try {
          const isBought = await this.hasUserPurchased(targetAddress, note.id);
          if (isBought) {
            purchased.push(note);
          }
        } catch (e) {
          // ignore
        }
      }
      return purchased;
    } catch (error) {
      console.error("Error fetching user purchases in contractConnection:", error);
      return [];
    }
  }

  // Check if user purchased a note
  async hasUserPurchased(userAddress, tokenId) {
    try {
      const contract = this.getReadContract();
      if (!contract) return false;
      if (typeof contract.hasPurchased === 'function') {
        return await contract.hasPurchased(userAddress, tokenId);
      }
      if (typeof contract.hasUserPurchased === 'function') {
        return await contract.hasUserPurchased(userAddress, tokenId);
      }
      return false;
    } catch (e) {
      console.warn("hasUserPurchased check error:", e);
      return false;
    }
  }

  // Get user rating for a note
  async getUserRating(userAddress, tokenId) {
    try {
      const contract = this.getReadContract();
      if (!contract) return 0;
      const targetUser = userAddress || (this.signer ? await this.signer.getAddress() : null);
      if (!targetUser) return 0;

      // In ABI: userRatings(tokenId, userAddress) -> uint8
      if (typeof contract.userRatings === 'function') {
        const rating = await contract.userRatings(tokenId, targetUser);
        return Number(rating);
      }
      if (typeof contract.getUserRating === 'function') {
        const rating = await contract.getUserRating(targetUser, tokenId);
        return Number(rating);
      }
      return 0;
    } catch (e) {
      console.warn("getUserRating check error:", e);
      return 0;
    }
  }

  // Get user's current address
  async getCurrentUser() {
    if (!this.signer) await this.connect();
    return await this.signer.getAddress();
  }

  // Withdraw earnings
  async withdrawEarnings() {
    const contract = await this.getSignerContract();
    
    const tx = await contract.withdrawEarnings();
    const receipt = await tx.wait();
    console.log("✅ Earnings withdrawn! Transaction:", receipt.hash);
    return receipt;
  }

  // Listen to events
  setupEventListeners(onNoteCreated, onNotePurchased, onNoteRated) {
    if (!this.contract) return;

    this.contract.on("NoteCreated", (tokenId, author, title, subject, price, ipfsHash, event) => {
      if (onNoteCreated) {
        onNoteCreated({
          tokenId: tokenId.toString(),
          author,
          title,
          subject,
          price: ethers.formatEther(price),
          ipfsHash,
          transactionHash: event.log.transactionHash
        });
      }
    });

    this.contract.on("NotePurchased", (tokenId, buyer, seller, price, event) => {
      if (onNotePurchased) {
        onNotePurchased({
          tokenId: tokenId.toString(),
          buyer,
          seller,
          price: ethers.formatEther(price),
          transactionHash: event.log.transactionHash
        });
      }
    });

    this.contract.on("NoteRated", (tokenId, rater, rating, newAverageRating, event) => {
      if (onNoteRated) {
        onNoteRated({
          tokenId: tokenId.toString(),
          rater,
          rating,
          newAverageRating,
          transactionHash: event.log.transactionHash
        });
      }
    });
  }
}

// ============ EXPORT SINGLETON ============

export const notesContract = new NotesMarketplaceContract();

// ============ QUICK TEST FUNCTIONS ============

export const testConnection = async () => {
  try {
    const connected = await notesContract.connect();
    if (connected) {
      const info = await notesContract.getContractInfo();
      console.log("🎉 CONTRACT CONNECTION SUCCESS!");
      console.log("📋 Contract Info:", info);
      console.log("🌍 Global Access: https://sepolia.etherscan.io/address/" + CONTRACT_ADDRESS);
      return info;
    }
  } catch (error) {
    console.error("❌ Connection test failed:", error);
    return null;
  }
};

// ============ USAGE EXAMPLE ============

/*
// In your React component:

import { notesContract, testConnection } from './contractConnection';

// Test connection
useEffect(() => {
  testConnection();
}, []);

// Create a note
const createNote = async () => {
  await notesContract.createNote(
    "My Study Note",
    "Description here",
    "QmHashHere",
    0.01, // 0.01 ETH
    "Computer Science",
    "https://metadata-uri.com"
  );
};

// Get all notes
const loadNotes = async () => {
  const notes = await notesContract.getAllNotes();
  setNotes(notes);
};

*/
