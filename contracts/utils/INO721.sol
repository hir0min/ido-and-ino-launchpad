//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/Strings.sol";
import "../interfaces/IFactory.sol";
import "../interfaces/IGovernance.sol";
import "../interfaces/INOv1.sol";

contract INO721 is INOv1, ERC721 {
    using SafeERC20 for IERC20;
    using Strings for uint256;

    bytes32 public constant VERSION = keccak256("INO721_v1");
    uint256 public constant TYPE = 721;

    address public factory;
    address public admin;

    uint256 public campaignId;
    uint256 public startAt;
    uint256 public endAt;
    address public paymentToken;

    string public baseURI;

    IGovernance public governance;

    mapping(uint256 => IFactory.WaveInfo) public waves;
    mapping(address => mapping(uint256 => uint256)) public purchasedAmt;

    modifier onlyFactory() {
        require(_msgSender() == factory, "Only Factory");
        _;
    }

    modifier onlyAdmin() {
        require(_msgSender() == admin, "Only Admin");
        _;
    }

    modifier onGoing() {
        require(block.timestamp <= endAt, "Campaign ended");
        _;
    }

    constructor(
        address _governance,
        address _admin,
        uint256 _campaignId,
        uint256 _startAt,
        uint256 _endAt,
        address _paymentToken,
        string memory _name,
        string memory _symbol,
        string memory _uri
    ) ERC721(_name, _symbol) {
        factory = _msgSender();
        admin = _admin;
        governance = IGovernance(_governance);
        paymentToken = _paymentToken;
        campaignId = _campaignId;
        startAt = _startAt;
        endAt = _endAt;
        baseURI = _uri;
    }

    function updateGovernance(address _newGovernance) external onlyAdmin {
        require(_newGovernance != address(0), "Set zero address");
        governance = IGovernance(_newGovernance);
    }

    function tokenURI(uint256 tokenId)
        public
        view
        override
        returns (string memory _uri)
    {
        require(_exists(tokenId), "URI query for nonexistent token");
        _uri = string(abi.encodePacked(baseURI, tokenId.toString()));
    }

    function setWave(
        uint256 _waveId,
        uint256 _limit,
        uint256 _start,
        uint256 _end
    ) external onlyFactory onGoing {
        require(waves[_waveId].startAt == 0, "Wave already set");
        require(
            startAt <= _start && _end <= endAt && _start < _end && _limit > 0,
            "Invalid settings"
        );

        waves[_waveId] = IFactory.WaveInfo(_limit, _start, _end);

        emit Wave(campaignId, _waveId, _start, _end);
    }

    function redeemSingle(Ticket calldata _ticket, bytes calldata _signature)
        public
        payable
        onGoing
    {
        require(_ticket.paymentToken == paymentToken, "Invalid payment token");

        //  TokenID = CampaignID + Type + WaveID (4 digits) + ID (9 digits)
        uint256 _campaignId = _ticket.tokenId / 10**36;
        uint256 _waveId = (_ticket.tokenId % 10**33) / 10**29;
        uint256 _type = (_ticket.tokenId % 10**36) / 10**33;
        require(_campaignId == campaignId && _type == TYPE, "Invalid tokenId");
        uint256 _current = block.timestamp;
        require(
            waves[_waveId].startAt <= _current &&
                _current <= waves[_waveId].endAt,
            "Not yet started or expired"
        );

        address _buyer;
        {
            // get rid of "stack too deep"
            _buyer = _msgSender();
            uint256 _purchasedAmt = purchasedAmt[_buyer][_waveId];
            require(
                _purchasedAmt + 1 <= waves[_waveId].limit,
                "Reach max allocation"
            );
            purchasedAmt[_buyer][_waveId] = _purchasedAmt + 1;
        }

        //  sig = sign(buyer, creator, saleId, tokenId, unitPrice, amount, paymentToken, type)
        bytes32 _data = keccak256(
            abi.encodePacked(
                _buyer,
                _ticket.creator,
                _ticket.saleId,
                _ticket.tokenId,
                _ticket.unitPrice,
                uint256(1),
                _ticket.paymentToken,
                _type
            )
        );
        _checkSignature(_data, _signature);

        _payment(_buyer, _ticket.unitPrice);
        _safeMint(_ticket.creator, _ticket.tokenId);
        _safeTransfer(_ticket.creator, _buyer, _ticket.tokenId, "");

        emit Redeem(
            address(this),
            _buyer,
            _ticket.tokenId,
            _ticket.paymentToken,
            _ticket.unitPrice,
            uint256(1)
        );
    }

    function redeemBulk(Bulk calldata _bulk, bytes calldata _signature)
        public
        payable
        onGoing
    {
        require(_bulk.paymentToken == paymentToken, "Invalid payment token");

        uint256 _tokenAmt = _bulk.tokenIds.length;
        uint256 _campaignId;
        uint256 _waveId;
        uint256 _type;
        address _buyer;
        {
            //  get rid of "stack too deep"

            //  Assume `tokenIDs` are grouped in one wave -> skip validating them
            //  retrieve the `campaignId`, `type` and `waveId` from `tokenIds[0]`
            uint256 _prefix = _bulk.tokenIds[0] / 10**29;
            _campaignId = _prefix / 10**7;
            _waveId = _prefix % 10**4;
            _type = (_prefix % 10**7) / 10**4;

            uint256 _current = block.timestamp;
            require(
                waves[_waveId].startAt <= _current &&
                    _current <= waves[_waveId].endAt,
                "Not yet started or expired"
            );

            _buyer = _msgSender();
            uint256 _purchasedAmt = purchasedAmt[_buyer][_waveId];
            require(
                _purchasedAmt + _tokenAmt <= waves[_waveId].limit,
                "Reach max allocation"
            );
            purchasedAmt[_buyer][_waveId] = _purchasedAmt + _tokenAmt;
        }

        bytes memory _packed;
        for (uint256 i; i < _tokenAmt; i++) {
            _packed = abi.encodePacked(_packed, _bulk.tokenIds[i]);
            _safeMint(_bulk.creator, _bulk.tokenIds[i]);
            _safeTransfer(_bulk.creator, _buyer, _bulk.tokenIds[i], "");
        }

        {
            //  sig = sign(buyer, creator, saleId, tokenId, unitPrice, amount, paymentToken, type)
            bytes32 _data = keccak256(
                abi.encodePacked(
                    _buyer,
                    _bulk.creator,
                    _bulk.saleId,
                    uint256(keccak256(_packed)),
                    _bulk.unitPrice,
                    _bulk.paymentToken,
                    _type
                )
            );
            _checkSignature(_data, _signature);
            _payment(_buyer, _bulk.unitPrice * _tokenAmt);
        }

        emit RedeemBulk(
            address(this),
            _buyer,
            _bulk.tokenIds,
            _bulk.paymentToken,
            _bulk.unitPrice
        );
    }

    function _payment(address _from, uint256 _amount) private {
        address _treasury = governance.treasury();
        address _paymentToken = paymentToken;
        if (_paymentToken == address(0)) {
            require(msg.value == _amount, "Insufficient payment");

            (bool sent, ) = payable(_treasury).call{value: _amount}("");
            require(sent, "Payment transfer failed");

            emit NativePayment(_from, _treasury, _amount);
        } else {
            IERC20(_paymentToken).safeTransferFrom(_from, _treasury, _amount);
        }
    }

    function _checkSignature(bytes32 _data, bytes calldata _signature)
        private
        view
    {
        //  Doesn't need to record a signature
        //  ERC-721: `tokenId` is unique. When it's already minted, the `tokenId` can be re-used
        //  In addition, burn() method is disable. Thus, it's safe
        //  If burn() is enable, it should record the used signature
        _data = ECDSA.toEthSignedMessageHash(_data);
        require(
            ECDSA.recover(_data, _signature) == governance.verifier(),
            "Invalid admin or params"
        );
    }
}
