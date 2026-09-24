import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ZodResponse } from 'nestjs-zod';
import { APP_TAG, AppError } from '../../../platform/http';
import { CurrentUserId, UserAuth } from '../guards';
import { DeviceProvider } from '../providers/device.provider';
import { SignInService } from '../sign-in.service';
import { type UserRow, UsersStore } from '../stores/users.store';
import { DeviceSignInDto, DeviceSignInResponseDto, UserDto } from './auth.dto';

const toUserDto = (user: UserRow) => ({
  id: user.id,
  supportCode: user.supportCode,
  createdAt: user.createdAt.toISOString(),
});

@ApiTags(APP_TAG)
@Controller('auth')
export class AuthController {
  constructor(
    private readonly signIn: SignInService,
    private readonly device: DeviceProvider,
    private readonly users: UsersStore,
  ) {}

  /** Signs in with the device secret; the first call creates the account. */
  @Post('device')
  @ZodResponse({ status: 200, type: DeviceSignInResponseDto })
  async signInWithDevice(@Body() body: DeviceSignInDto) {
    const result = await this.signIn.signIn(this.device, { secret: body.secret });
    return {
      accessToken: result.accessToken,
      expiresIn: result.expiresIn,
      user: toUserDto(result.user),
      isNewUser: result.created,
    };
  }

  @Get('me')
  @UserAuth()
  @ZodResponse({ status: 200, type: UserDto })
  async me(@CurrentUserId() userId: string) {
    const user = await this.users.findById(userId);
    // A deleted account's token is still signed; 401 makes the app sign in afresh.
    if (!user) throw AppError.unauthorized('user_not_found', 'The account no longer exists');
    return toUserDto(user);
  }
}
