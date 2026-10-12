// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts@5.0.2/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts@5.0.2/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts@5.0.2/access/Ownable.sol";
import "@openzeppelin/contracts@5.0.2/utils/ReentrancyGuard.sol";

/**
 * @title NotesMarketplace
 * @notice Decentralized Marketplace for trading study notes as NFTs on Ethereum Sepolia
 */
contract NotesMarketplace is ERC721, ERC721URIStorage, Ownable, ReentrancyGuard {
    uint256 private _tokenIdCounter;
    uint256 public platformFee = 250; // 2.5% platform fee (250 / 10000)
    uint256 public constant PLATFORM_FEE_BASIS_POINTS = 250;
    uint256 public constant MAX_PLATFORM_FEE = 1000; // 10% maximum
    bool public paused = false;

    // Structs matching frontend exactly
    struct Note {
        string title;
        string description;
        string ipfsHash;
        address author;
        uint256 price;
        bool forSale;
        uint256 createdAt;
        string subject;
        uint8 rating;
        uint256 ratingCount;
        uint256 totalRating;
        uint256 downloadCount;
    }

    struct UserProfile {
        string name;
        string bio;
        bool verified;
        uint256 totalEarnings;
        uint256 notesCreated;
        uint8 reputation;
    }

    // Mappings
    mapping(uint256 => Note) public notes;
    mapping(address => uint256[]) public authorNotes;
    mapping(string => uint256[]) public subjectNotes;
    mapping(uint256 => mapping(address => uint8)) public userRatings;
    mapping(address => mapping(uint256 => bool)) public hasPurchased;
    mapping(address => uint256) public authorEarnings;
    mapping(address => UserProfile) public userProfiles;
    mapping(address => uint256[]) public userPurchases;

    // Events
    event NoteCreated(uint256 indexed tokenId, address indexed author, string title, string subject, uint256 price, string ipfsHash);
    event NotePurchased(uint256 indexed tokenId, address indexed buyer, address indexed seller, uint256 price);
    event NoteRated(uint256 indexed tokenId, address indexed rater, uint8 rating);
    event PriceUpdated(uint256 indexed tokenId, uint256 oldPrice, uint256 newPrice);
    event SaleStatusUpdated(uint256 indexed tokenId, bool forSale);
    event EarningsWithdrawn(address indexed author, uint256 amount);
    event PlatformFeeUpdated(uint256 oldFee, uint256 newFee);
    event ContractPaused(bool paused);
    event UserVerified(address indexed user);

    // Modifiers
    modifier onlyAuthor(uint256 tokenId) {
        require(_ownerOf(tokenId) != address(0), "Note does not exist");
        require(notes[tokenId].author == msg.sender, "Not the author");
        _;
    }

    modifier noteExists(uint256 tokenId) {
        require(_ownerOf(tokenId) != address(0), "Note does not exist");
        _;
    }

    modifier notPaused() {
        require(!paused, "Contract is paused");
        _;
    }

    modifier validPrice(uint256 price) {
        require(price > 0, "Price must be greater than 0");
        _;
    }

    modifier validRating(uint8 rating) {
        require(rating >= 1 && rating <= 5, "Rating must be between 1 and 5");
        _;
    }

    constructor() ERC721("StudyNotesNFT", "NOTES") Ownable(msg.sender) {}

    /**
     * @notice Creates a new study note NFT
     * @param title The title of the study note
     * @param description Brief description of note content
     * @param ipfsHash Pinata / IPFS CID of the note document
     * @param price Price in wei for purchasing access
     * @param subject Subject category (e.g. Computer Science)
     * @param metadataURI Full IPFS metadata URI
     * @return tokenId The newly minted note ID
     */
    function createNote(
        string memory title,
        string memory description,
        string memory ipfsHash,
        uint256 price,
        string memory subject,
        string memory metadataURI
    ) external notPaused validPrice(price) returns (uint256) {
        require(bytes(title).length > 0, "Title cannot be empty");
        require(bytes(description).length > 0, "Description cannot be empty");
        require(bytes(ipfsHash).length > 0, "IPFS hash cannot be empty");
        require(bytes(subject).length > 0, "Subject cannot be empty");

        uint256 tokenId = _tokenIdCounter;
        _tokenIdCounter++;

        Note storage note = notes[tokenId];
        note.title = title;
        note.description = description;
        note.ipfsHash = ipfsHash;
        note.author = msg.sender;
        note.price = price;
        note.forSale = true;
        note.createdAt = block.timestamp;
        note.subject = subject;

        authorNotes[msg.sender].push(tokenId);
        subjectNotes[subject].push(tokenId);
        userProfiles[msg.sender].notesCreated++;

        _safeMint(msg.sender, tokenId);
        _setTokenURI(tokenId, metadataURI);

        emit NoteCreated(tokenId, msg.sender, title, subject, price, ipfsHash);
        return tokenId;
    }

    /**
     * @notice Purchases access to a study note
     * @param tokenId The ID of the note to purchase
     */
    function purchaseNote(uint256 tokenId) 
        external 
        payable 
        nonReentrant 
        notPaused 
        noteExists(tokenId) 
    {
        Note storage note = notes[tokenId];
        require(note.forSale, "Note is not for sale");
        require(msg.value >= note.price, "Insufficient payment");
        require(msg.sender != note.author, "Cannot buy your own note");
        require(!hasPurchased[msg.sender][tokenId], "Already purchased");

        address seller = note.author;
        uint256 salePrice = note.price;

        uint256 fee = (salePrice * platformFee) / 10000;
        uint256 authorPayment = salePrice - fee;

        hasPurchased[msg.sender][tokenId] = true;
        userPurchases[msg.sender].push(tokenId);
        note.downloadCount++;
        authorEarnings[seller] += authorPayment;
        userProfiles[seller].totalEarnings += authorPayment;

        // Refund any excess payment
        if (msg.value > salePrice) {
            (bool refundSent, ) = payable(msg.sender).call{value: msg.value - salePrice}("");
            require(refundSent, "Refund failed");
        }

        emit NotePurchased(tokenId, msg.sender, seller, salePrice);
    }

    /**
     * @notice Rates a note
     * @param tokenId The ID of the note to rate
     * @param rating Rating between 1 and 5
     */
    function rateNote(uint256 tokenId, uint8 rating) 
        external 
        noteExists(tokenId) 
        validRating(rating) 
    {
        require(hasPurchased[msg.sender][tokenId], "Must purchase note to rate");
        require(msg.sender != notes[tokenId].author, "Cannot rate own note");
        require(userRatings[tokenId][msg.sender] == 0, "Already rated this note");

        Note storage note = notes[tokenId];
        userRatings[tokenId][msg.sender] = rating;
        note.totalRating += rating;
        note.ratingCount++;
        note.rating = uint8(note.totalRating / note.ratingCount);

        emit NoteRated(tokenId, msg.sender, rating);
    }

    /**
     * @notice Updates note price
     * @param tokenId The ID of the note
     * @param newPrice New price in wei
     */
    function updatePrice(uint256 tokenId, uint256 newPrice) 
        external 
        onlyAuthor(tokenId) 
        validPrice(newPrice) 
    {
        uint256 oldPrice = notes[tokenId].price;
        notes[tokenId].price = newPrice;
        emit PriceUpdated(tokenId, oldPrice, newPrice);
    }

    /**
     * @notice Updates sale status
     * @param tokenId The ID of the note
     * @param forSale New sale status
     */
    function updateSaleStatus(uint256 tokenId, bool forSale) 
        external 
        onlyAuthor(tokenId) 
    {
        notes[tokenId].forSale = forSale;
        emit SaleStatusUpdated(tokenId, forSale);
    }

    /**
     * @notice Toggles sale status
     * @param tokenId The ID of the note
     */
    function toggleSaleStatus(uint256 tokenId) 
        external 
        onlyAuthor(tokenId) 
    {
        notes[tokenId].forSale = !notes[tokenId].forSale;
        emit SaleStatusUpdated(tokenId, notes[tokenId].forSale);
    }

    /**
     * @notice Withdraws author earnings
     */
    function withdrawEarnings() external nonReentrant {
        uint256 earnings = authorEarnings[msg.sender];
        require(earnings > 0, "No earnings to withdraw");

        authorEarnings[msg.sender] = 0;
        (bool sent, ) = payable(msg.sender).call{value: earnings}("");
        require(sent, "Withdrawal failed");

        emit EarningsWithdrawn(msg.sender, earnings);
    }

    // View Functions
    function getAllNotes() external view returns (uint256[] memory) {
        uint256 total = _tokenIdCounter;
        uint256[] memory ids = new uint256[](total);
        for (uint256 i = 0; i < total; i++) {
            ids[i] = i;
        }
        return ids;
    }

    function getMultipleNotes(uint256[] memory tokenIds) external view returns (Note[] memory) {
        Note[] memory result = new Note[](tokenIds.length);
        for (uint256 i = 0; i < tokenIds.length; i++) {
            result[i] = notes[tokenIds[i]];
        }
        return result;
    }

    function getNoteDetails(uint256 tokenId) external view noteExists(tokenId) returns (Note memory) {
        return notes[tokenId];
    }

    function getNotesByAuthor(address author) external view returns (uint256[] memory) {
        return authorNotes[author];
    }

    function getNotesBySubject(string memory subject) external view returns (uint256[] memory) {
        return subjectNotes[subject];
    }

    function getUserPurchases(address user) external view returns (uint256[] memory) {
        return userPurchases[user];
    }

    function getTotalNotes() external view returns (uint256) {
        return _tokenIdCounter;
    }

    function hasUserPurchased(address user, uint256 tokenId) external view returns (bool) {
        return hasPurchased[user][tokenId];
    }

    function getUserRating(address user, uint256 tokenId) external view returns (uint8) {
        return userRatings[tokenId][user];
    }

    // Admin Functions
    function updatePlatformFee(uint256 newFee) external onlyOwner {
        require(newFee <= MAX_PLATFORM_FEE, "Fee exceeds maximum");
        uint256 oldFee = platformFee;
        platformFee = newFee;
        emit PlatformFeeUpdated(oldFee, newFee);
    }

    function setPaused(bool _paused) external onlyOwner {
        paused = _paused;
        emit ContractPaused(_paused);
    }

    function verifyUser(address user) external onlyOwner {
        userProfiles[user].verified = true;
        emit UserVerified(user);
    }

    function withdrawPlatformFees() external onlyOwner nonReentrant {
        uint256 balance = address(this).balance;
        require(balance > 0, "No fees to withdraw");
        (bool sent, ) = payable(owner()).call{value: balance}("");
        require(sent, "Withdrawal failed");
    }

    function emergencyWithdraw() external onlyOwner {
        uint256 balance = address(this).balance;
        require(balance > 0, "No balance to withdraw");
        (bool sent, ) = payable(owner()).call{value: balance}("");
        require(sent, "Emergency withdrawal failed");
    }

    function tokenURI(uint256 tokenId) public view override(ERC721, ERC721URIStorage) returns (string memory) {
        require(_ownerOf(tokenId) != address(0), "Token does not exist");
        string memory _uri = super.tokenURI(tokenId);
        if (bytes(_uri).length > 0) {
            return _uri;
        }
        return string(abi.encodePacked("ipfs://", notes[tokenId].ipfsHash));
    }

    function supportsInterface(bytes4 interfaceId) public view override(ERC721, ERC721URIStorage) returns (bool) {
        return super.supportsInterface(interfaceId);
    }

    receive() external payable {}
}
