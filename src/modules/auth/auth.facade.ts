import { Injectable } from '@nestjs/common';
import { AdminSignInService } from './admin-sign-in.service';
import { UsersStore } from './users.store';

export interface UserSummary {
  id: string;
  supportCode: string;
  createdAt: Date;
  lastSeenAt: Date;
}

/** What other modules and CLI commands may ask of `auth`. */
@Injectable()
export class AuthFacade {
  constructor(
    private readonly users: UsersStore,
    private readonly adminSignIn: AdminSignInService,
  ) {}

  async findUser(userId: string): Promise<UserSummary | null> {
    const user = await this.users.findById(userId);
    return user && { ...user };
  }

  /** Account deletion step: removes the user and every identity. Idempotent. */
  async deleteUser(userId: string): Promise<void> {
    await this.users.delete(userId);
  }

  async createAdmin(login: string, password: string): Promise<{ id: string; login: string }> {
    const admin = await this.adminSignIn.createAdmin(login, password);
    return { id: admin.id, login: admin.login };
  }

  async setAdminPassword(login: string, password: string): Promise<void> {
    await this.adminSignIn.setPassword(login, password);
  }
}
