// Sample TypeScript file for integration tests
/* eslint-disable @typescript-eslint/no-unused-vars */

interface User {
  name: string;
  age: number;
}

class UserManager {
  private users: User[] = [];

  addUser(user: User): void {
    this.users.push(user);
  }

  getUsers(): User[] {
    return this.users;
  }
}

class _AdminManager extends UserManager {
  role: string = "admin";
}

var _userName = "Alice";
var _userAge = 30;
const _isActive = true;
var _userEmail = "alice@example.com";
