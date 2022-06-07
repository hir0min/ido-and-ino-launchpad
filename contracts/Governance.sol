// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/Ownable.sol";

contract Governance is Ownable {
    //  Address of Treasury
    address public treasury;

    //  Address of Verifier
    address public verifier;

    //  Address that has an authority to create Campaigns in Factory721/Factory1155 contracts
    address public manager;

    //  A list of supported ERC-20 Tokens
    mapping(address => bool) public acceptedPayments;

    event Treasury(address indexed oldTreasury, address indexed newTreasury);
    event PaymentAcceptance(
        address indexed _token,
        bool _isRegistered // true = Registered, false = Removed
    );

    constructor(
        address _treasury,
        address _verifier,
        address _manager,
        address[] memory _tokens
    ) Ownable() {
        //  Set Treasury wallet address and verifer
        treasury = _treasury;
        verifier = _verifier;
        manager = _manager;

        //  Set acceptance payments
        for (uint256 i; i < _tokens.length; i++) {
            acceptedPayments[_tokens[i]] = true;
        }
    }

    /**
       @notice Change new address of Treasury
       @dev  Caller must be Owner
       @param _newTreasury    Address of new Treasury
    */
    function updateTreasury(address _newTreasury) external onlyOwner {
        require(_newTreasury != address(0), "Set zero address");

        emit Treasury(treasury, _newTreasury);
        treasury = _newTreasury;
    }

    /**
       @notice Update new address of Vendor contract
       @dev  Caller must be Owner
       @param _newVerifier    Address of new Vendor contract
    */
    function updateVerifier(address _newVerifier) external onlyOwner {
        require(_newVerifier != address(0), "Set zero address");
        verifier = _newVerifier;
    }

    /**
       @notice Change new address of Manager
       @dev  Caller must be Owner
       @param _newManager    Address of new Treasury
    */
    function updateManager(address _newManager) external onlyOwner {
        require(_newManager != address(0), "Set zero address");
        manager = _newManager;
    }

    /**
        @notice Register a new acceptance payment token
            Owner calls this function to register new ERC-20 Token
        @dev Caller must be Owner
        @param _token           Address of ERC-20 Token contract
    */
    function registerToken(address _token) external onlyOwner {
        require(!acceptedPayments[_token], "Token registered");
        require(_token != address(0), "Set zero address");
        acceptedPayments[_token] = true;
        emit PaymentAcceptance(_token, true);
    }

    /**
        @notice Unregister a current acceptance payment token
            Owner calls this function to unregister existing ERC-20 Token
        @dev Caller must be Owner
        @param _token           Address of ERC-20 Token contract to be removed
    */
    function unregisterToken(address _token) external onlyOwner {
        require(acceptedPayments[_token], "Token not registered");
        delete acceptedPayments[_token];
        emit PaymentAcceptance(_token, false);
    }
}
