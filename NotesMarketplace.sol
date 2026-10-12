// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title NotesMarketplace
 * @dev Decentralized Marketplace for trading study notes as NFTs on Ethereum Sepolia
 */
contract NotesMarketplace is ERC721, ERC721URIStorage, Ownable, ReentrancyGuard {
    uint256 private _tokenIdCounter;
    uint256 public platformFee = 250; // 2.5%
    uint256 public constant MAX_PLATFORM_FEE = 1000; // 10% max
    bool public paused;

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

    // Custom errors (saves significant bytecode vs require strings)
    error NotAuthor();
    error NoteNotFound();
    error WhenPaused();
    error ZeroPrice();
    error BadRating();
    error EmptyField();
    error NotForSale();
    error InsufficientPayment();
    error SelfPurchase();
    error AlreadyPurchased();
    error AlreadyRated();
    error NoEarnings();
    error RefundFailed();
    error WithdrawFailed();
    error FeeTooHigh();
    error NoFees();

    modifier onlyAuthor(uint256 tokenId) {
        if (notes[tokenId].author != msg.sender) revert NotAuthor();
        _;
    }

    modifier noteExists(uint256 tokenId) {
        if (_ownerOf(tokenId) == address(0)) revert NoteNotFound();
        _;
    }

    modifier notPaused_() {
        if (paused) revert WhenPaused();
        _;
    }

    modifier validPrice(uint256 price) {
        if (price == 0) revert ZeroPrice();
        _;
    }

    modifier validRating_(uint8 rating) {
        if (rating < 1 || rating > 5) revert BadRating();
        _;
    }

    constructor() ERC721("StudyNotesNFT", "NOTES") Ownable(msg.sender) {}

    function createNote(
        string memory title,
        string memory description,
        string memory ipfsHash,
        uint256 price,
        string memory subject,
        string memory metadataURI
    ) external notPaused_ validPrice(price) returns (uint256) {
        if (bytes(title).length == 0) revert EmptyField();
        if (bytes(description).length == 0) revert EmptyField();
        if (bytes(ipfsHash).length == 0) revert EmptyField();
        if (bytes(subject).length == 0) revert EmptyField();

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

    function purchaseNote(uint256 tokenId)
        external
        payable
        nonReentrant
        notPaused_
        noteExists(tokenId)
    {
        Note storage note = notes[tokenId];
        if (!note.forSale) revert NotForSale();
        if (msg.value < note.price) revert InsufficientPayment();
        if (msg.sender == note.author) revert SelfPurchase();
        if (hasPurchased[msg.sender][tokenId]) revert AlreadyPurchased();

        address seller = note.author;
        uint256 salePrice = note.price;
        uint256 fee = (salePrice * platformFee) / 10000;
        uint256 authorPayment = salePrice - fee;

        hasPurchased[msg.sender][tokenId] = true;
        userPurchases[msg.sender].push(tokenId);
        note.downloadCount++;
        authorEarnings[seller] += authorPayment;
        userProfiles[seller].totalEarnings += authorPayment;

        _transfer(seller, msg.sender, tokenId);

        if (msg.value > salePrice) {
            (bool refundSent, ) = payable(msg.sender).call{value: msg.value - salePrice}("");
            if (!refundSent) revert RefundFailed();
        }

        emit NotePurchased(tokenId, msg.sender, seller, salePrice);
    }

    function rateNote(uint256 tokenId, uint8 rating)
        external
        noteExists(tokenId)
        validRating_(rating)
    {
        if (msg.sender == notes[tokenId].author) revert SelfPurchase();
        if (userRatings[tokenId][msg.sender] != 0) revert AlreadyRated();

        Note storage note = notes[tokenId];
        userRatings[tokenId][msg.sender] = rating;
        note.totalRating += rating;
        note.ratingCount++;
        note.rating = uint8(note.totalRating / note.ratingCount);

        emit NoteRated(tokenId, msg.sender, rating);
    }

    function updatePrice(uint256 tokenId, uint256 newPrice)
        external
        onlyAuthor(tokenId)
        validPrice(newPrice)
    {
        uint256 oldPrice = notes[tokenId].price;
        notes[tokenId].price = newPrice;
        emit PriceUpdated(tokenId, oldPrice, newPrice);
    }

    function updateSaleStatus(uint256 tokenId, bool forSale) external onlyAuthor(tokenId) {
        notes[tokenId].forSale = forSale;
        emit SaleStatusUpdated(tokenId, forSale);
    }

    function toggleSaleStatus(uint256 tokenId) external onlyAuthor(tokenId) {
        notes[tokenId].forSale = !notes[tokenId].forSale;
        emit SaleStatusUpdated(tokenId, notes[tokenId].forSale);
    }

    function withdrawEarnings() external nonReentrant {
        uint256 earnings = authorEarnings[msg.sender];
        if (earnings == 0) revert NoEarnings();

        authorEarnings[msg.sender] = 0;
        (bool sent, ) = payable(msg.sender).call{value: earnings}("");
        if (!sent) revert WithdrawFailed();

        emit EarningsWithdrawn(msg.sender, earnings);
    }

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

    function getTotalNotes() external view returns (uint256) {
        return _tokenIdCounter;
    }

    // Admin Functions
    function updatePlatformFee(uint256 newFee) external onlyOwner {
        if (newFee > MAX_PLATFORM_FEE) revert FeeTooHigh();
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
        if (balance == 0) revert NoFees();
        (bool sent, ) = payable(owner()).call{value: balance}("");
        if (!sent) revert WithdrawFailed();
    }

    function emergencyWithdraw() external onlyOwner {
        (bool sent, ) = payable(owner()).call{value: address(this).balance}("");
        if (!sent) revert WithdrawFailed();
    }

    function tokenURI(uint256 tokenId) public view override(ERC721, ERC721URIStorage) returns (string memory) {
        if (_ownerOf(tokenId) == address(0)) revert NoteNotFound();
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
