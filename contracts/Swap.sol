//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "./interfaces/ISwap.sol";

/**
    @title Swap contract
    @dev This contract handles swapping two Tokens:
        + ERC-20 Token (i.e. USDC, USDT, WETH,...) or Native Coin   (1)
        + IDO Token (ERC-20)                                        (2)
    - State variable: Treasury (public), Verifier/Validator
    - Allow to update Treasury address (only Owner)
    - Allow to update Verifier/Validator address (only Owner)
    - method swap() with params:
        + eventID: unique integer number
        + inToken: address of ERC-20 IDO Token (2)
        + outToken: address of ERC-20 Token/Native Coin (1)
        + holder: address of Holder that releases ERC-20 IDO Token
        + inAmt: amount of ERC-20 IDO Token to receive (Holder -> inAmt -> Requestor)
        + outAmt: amount of ERC-20 Token/Native Coin to pay (Requestor -> outAmt -> Treasury)
        + maxAllocation: available allocation of outToken to swap
        + Signature: sign(eventID, inAmt, outAmt, inToken, outToken, holder, requestor)
    - If outToken = address(0) - Native Coin, check outAmt == msg.value
*/
contract Swap is ISwap, OwnableUpgradeable, ReentrancyGuardUpgradeable {
    using SafeERC20Upgradeable for IERC20Upgradeable;

    // Address of payment and fee collector
    address public treasury;

    // Address of verifier to authorize holders to swap
    address public verifier;

    // Current available allocations of user in events
    mapping(uint256 => mapping(address => Allocation)) public allocations;

    function init(address _treasury, address _verifier) external initializer {
        __Ownable_init();

        treasury = _treasury;
        verifier = _verifier;
    }

    /**
       @notice Update a new Verifier address
       @dev Caller must be Owner
            Address of new Verifier should not be address(0)
       @param _newVerifier Address of a new Verifier
     */
    function updateVerifier(address _newVerifier) external override onlyOwner {
        require(_newVerifier != address(0), "Set zero address");
        verifier = _newVerifier;
        emit Verifier(verifier, _newVerifier);
    }

    /**
       @notice Update new address of Treasury
       @dev Caller must be Owner
       @param _newTreasury Address of a new Treasury
     */
    function updateTreasury(address _newTreasury) external override onlyOwner {
        require(_newTreasury != address(0), "Set zero address");
        treasury = _newTreasury;
        emit Treasury(treasury, _newTreasury);
    }

    /**
       @notice Swap ERC20 Token/Native coin for ERC20 IDO Token
       @dev Caller can be anyone
     */
    function swap(
        uint256 _eventID,
        uint256 _inAmt,
        uint256 _outAmt,
        uint256 _maxAllocation,
        address _inToken,
        address _outToken,
        address _holder,
        bytes calldata _signature
    ) external payable override nonReentrant {
        require(_inToken != address(0), "Invalid token address");
        require(_maxAllocation > 0, "Invalid allocation");

        address _sender = _msgSender();
        uint256 _currentAmt = allocations[_eventID][_sender].availableAmt;

        if (!allocations[_eventID][_sender].locked) {
            allocations[_eventID][_sender].locked = true;
            _currentAmt = _maxAllocation;
        } else {
            require(_outAmt <= _currentAmt, "Exceed available allocation");
        }

        bytes32 _data = keccak256(
            abi.encodePacked(
                _eventID,
                _inAmt,
                _outAmt,
                _maxAllocation,
                _inToken,
                _outToken,
                _holder,
                _sender
            )
        );
        _checkSignature(_data, _signature);

        allocations[_eventID][_sender].availableAmt = _currentAmt - _outAmt;
        _payment(_sender, _outAmt, _outToken);
        _releaseTransfer(_holder, _sender, _inAmt, _inToken);

        emit Swap(
            _eventID,
            _sender,
            _holder,
            _inAmt,
            _outAmt,
            _inToken,
            _outToken
        );
    }

    function _checkSignature(bytes32 _data, bytes calldata _signature)
        private
        view
    {
        _data = ECDSA.toEthSignedMessageHash(_data);
        require(
            ECDSA.recover(_data, _signature) == verifier,
            "Invalid verifier or params"
        );
    }

    function _payment(
        address _from,
        uint256 _outAmt,
        address _outToken
    ) private {
        address _treasury = treasury; //  gas saving
        if (_outToken == address(0)) {
            require(msg.value == _outAmt, "Invalid payment");

            (bool sent, ) = payable(_treasury).call{value: _outAmt}("");
            require(sent, "Payment transfer failed");
        } else {
            IERC20Upgradeable(_outToken).safeTransferFrom(
                _from,
                _treasury,
                _outAmt
            );
        }
    }

    function _releaseTransfer(
        address _from,
        address _to,
        uint256 _inAmt,
        address _inToken
    ) private {
        IERC20Upgradeable(_inToken).safeTransferFrom(_from, _to, _inAmt);
    }
}
