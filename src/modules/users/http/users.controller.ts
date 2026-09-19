import { Controller, Delete, HttpCode } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { APP_TAG } from '../../../platform/http';
import { CurrentUserId, UserAuth } from '../../auth';
import { AccountDeletionService } from '../account-deletion.service';

@ApiTags(APP_TAG)
@UserAuth()
@Controller('users')
export class UsersController {
  constructor(private readonly deletion: AccountDeletionService) {}

  /**
   * Deletes the signed-in account with its favorites, reviews, consents and
   * purchases. The device secret no longer signs in to it; the next sign-in
   * starts a new account.
   */
  @Delete('me')
  @HttpCode(204)
  async deleteMe(@CurrentUserId() userId: string): Promise<void> {
    await this.deletion.deleteAccount(userId);
  }
}
