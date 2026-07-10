import { Body, Controller, Get, HttpCode, Patch, Post, UseGuards } from '@nestjs/common';

import { AuthenticatedUser, CurrentUser } from '../common/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { UsersService } from '../users/users.service';
import { AuthService } from './auth.service';
import { GoogleSignInDto } from './dto/google-signin.dto';
import { RequestPasswordResetDto } from './dto/request-password-reset.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { SigninDto } from './dto/signin.dto';
import { SignupDto } from './dto/signup.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly users: UsersService,
  ) {}

  @Post('signup')
  signup(@Body() dto: SignupDto) {
    return this.auth.signup(dto);
  }

  @Post('signin')
  @HttpCode(200)
  signin(@Body() dto: SigninDto) {
    return this.auth.signin(dto);
  }

  @Post('google')
  @HttpCode(200)
  google(@Body() dto: GoogleSignInDto) {
    return this.auth.googleSignIn(dto);
  }

  // Password reset. Public + email-based (the user can't sign in), and
  // enumeration-safe: request-password-reset always returns { ok: true } and
  // reset-password uses generic errors so neither reveals whether an account
  // exists.
  @Post('request-password-reset')
  @HttpCode(200)
  requestPasswordReset(@Body() dto: RequestPasswordResetDto) {
    return this.auth.requestPasswordReset(dto.email);
  }

  @Post('reset-password')
  @HttpCode(200)
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.auth.resetPassword(dto);
  }

  // Email verification. The user already holds a JWT from signup, so these are
  // guarded and act on the token's userId.
  @UseGuards(JwtAuthGuard)
  @Post('verify-email')
  @HttpCode(200)
  verifyEmail(@CurrentUser() user: AuthenticatedUser, @Body() dto: VerifyEmailDto) {
    return this.auth.verifyEmail(user.id, dto.code);
  }

  @UseGuards(JwtAuthGuard)
  @Post('resend-code')
  @HttpCode(200)
  resendCode(@CurrentUser() user: AuthenticatedUser) {
    return this.auth.resendCode(user.id);
  }

  // JWT is stateless on the server. The mobile app drops the token on signout.
  @UseGuards(JwtAuthGuard)
  @Post('signout')
  @HttpCode(204)
  signout() {
    return;
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  me(@CurrentUser() user: AuthenticatedUser) {
    return this.users.getProfile(user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('me')
  updateMe(@CurrentUser() user: AuthenticatedUser, @Body() dto: UpdateProfileDto) {
    return this.users.updateProfile(user.id, dto);
  }
}
