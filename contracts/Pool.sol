//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "./interfaces/IPool.sol";
import "./interfaces/ITier.sol";

contract Pool is IPool, Initializable, OwnableUpgradeable {
    using SafeERC20Upgradeable for IERC20Upgradeable;

    uint256 public totalUsers;
    mapping(address => uint256) public lockedAmt;

    IERC20Upgradeable public token;

    function init(address _token) external initializer {
        __Ownable_init();

        require(address(_token) != address(0), "Set zero address");
        token = IERC20Upgradeable(_token);
    }

    /**
        @notice Users stack ERC-20 Tokens
        @dev Caller can be ANY
        @param _amount      Amount of ERC-20 Tokens requesting to stack
     */
    function lock(uint256 _amount) external override {
        address _user = _msgSender();
        uint256 _currentAmt = lockedAmt[_user];

        //  Transfer ERC-20 Token from `_user` to Pool contract
        //  If balance of `_user` is insufficient or not set approve()
        //  the request fails likely
        token.safeTransferFrom(_user, address(this), _amount);

        uint256 _totalUser = totalUsers;
        if (_currentAmt == 0) totalUsers = _totalUser + 1;

        lockedAmt[_user] = _currentAmt + _amount;
        emit TokenLock(_user, _currentAmt, _currentAmt + _amount);
    }

    /**
        @notice Users allow to withdraw an amount of their locked ERC-20 Tokens
        @dev Caller can be ANY
        @param _amount      Amount of ERC-20 Tokens requesting to withdraw
    */
    function withdraw(uint256 _amount) external override {
        address _user = _msgSender();
        uint256 _currentAmt = lockedAmt[_user];
        require(_amount <= _currentAmt, "LockPool: Insufficient balance");

        if (_currentAmt - _amount == 0) {
            uint256 _totalUser = totalUsers;
            delete lockedAmt[_user];
            totalUsers = _totalUser - 1;
        } else {
            lockedAmt[_user] = _currentAmt - _amount;
        }
        token.safeTransfer(_user, _amount);

        emit TokenWithdrawal(_user, _currentAmt, _currentAmt - _amount);
    }

    /**
        @notice Query the locked tokens of `_users`
        @dev Caller can be ANY
        @param _users       A list of Users that needs to be queried
    */
    function getLockedAmounts(address[] calldata _users)
        external
        view
        override
        returns (uint256[] memory _amounts)
    {
        uint256 _loop = _users.length;
        _amounts = new uint256[](_loop);
        for (uint256 i; i < _loop; i++) {
            _amounts[i] = lockedAmt[_users[i]];
        }
    }
}
