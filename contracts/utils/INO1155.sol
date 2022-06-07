//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/Strings.sol";
import "../interfaces/IFactory.sol";
import "../interfaces/IGovernance.sol";
import "../interfaces/INOv1.sol";

contract INO1155 is INOv1, ERC1155 {
    using SafeERC20 for IERC20;
    using Strings for uint256;

    bytes32 public constant VERSION = keccak256("INO1155_v1");
    uint256 public constant TYPE = 1155;

    address public factory;
    address public admin;

    uint256 public campaignId;
    uint256 public startAt;
    uint256 public endAt;
    address public paymentToken;

    IGovernance public governance;

    mapping(uint256 => IFactory.WaveInfo) public waves;
    mapping(address => mapping(uint256 => uint256)) public purchasedAmt;
    mapping(bytes32 => bool) public prevSigns;

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
        string memory _uri
    ) ERC1155(_uri) {
        factory = _msgSender();
        admin = _admin;
        governance = IGovernance(_governance);
        paymentToken = _paymentToken;
        campaignId = _campaignId;
        startAt = _startAt;
        endAt = _endAt;
    }

    function updateGovernance(address _newGovernance) external onlyAdmin {
        require(_newGovernance != address(0), "Set zero address");
        governance = IGovernance(_newGovernance);
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

    function tokenURI(uint256 _tokenId)
        external
        view
        returns (string memory _uri)
    {
        _uri = uri(_tokenId);
        _uri = string(
            abi.encodePacked(bytes(_uri), bytes(_tokenId.toString()))
        );
    }

    function redeem(Ticket calldata _ticket, bytes calldata _signature)
        external
        payable
        onGoing
    {
        require(_ticket.paymentToken == paymentToken, "Invalid payment token");

        //  TokenID = CampaignID + Type + WaveID (4 digits) + ID (9 digits)
        uint256 _type;
        address _buyer = _msgSender();
        {
            //  get rid of "stack too deep"
            uint256 _campaignId = _ticket.tokenId / 10**37;
            uint256 _waveId = (_ticket.tokenId % 10**33) / 10**29;
            _type = (_ticket.tokenId % 10**37) / 10**33;
            require(
                _campaignId == campaignId && _type == TYPE,
                "Invalid tokenId"
            );
            uint256 _current = block.timestamp;
            require(
                waves[_waveId].startAt <= _current &&
                    _current <= waves[_waveId].endAt,
                "Not yet started or expired"
            );

            uint256 _purchasedAmt = purchasedAmt[_buyer][_waveId];
            require(
                _purchasedAmt + _ticket.amount <= waves[_waveId].limit,
                "Reach max allocation"
            );
            purchasedAmt[_buyer][_waveId] = _purchasedAmt + _ticket.amount;
        }

        //  sig = sign(buyer, creator, saleId, tokenId, unitPrice, amount, paymentToken, type)
        bytes32 _data = keccak256(
            abi.encodePacked(
                _buyer,
                _ticket.creator,
                _ticket.saleId,
                _ticket.tokenId,
                _ticket.unitPrice,
                _ticket.amount,
                _ticket.paymentToken,
                _type
            )
        );
        _checkSignature(_data, _signature);

        _payment(_buyer, _ticket.unitPrice * _ticket.amount);
        _mint(_ticket.creator, _ticket.tokenId, _ticket.amount, "");
        _safeTransferFrom(
            _ticket.creator,
            _buyer,
            _ticket.tokenId,
            _ticket.amount,
            ""
        );

        emit Redeem(
            address(this),
            _buyer,
            _ticket.tokenId,
            _ticket.paymentToken,
            _ticket.unitPrice,
            _ticket.amount
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

    function _checkSignature(bytes32 _data, bytes calldata _signature) private {
        require(!prevSigns[_data], "Signature was used");
        prevSigns[_data] = true;
        _data = ECDSA.toEthSignedMessageHash(_data);
        require(
            ECDSA.recover(_data, _signature) == governance.verifier(),
            "Invalid admin or params"
        );
    }
}
