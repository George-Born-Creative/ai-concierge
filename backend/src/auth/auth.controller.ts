import { Body, Controller, Get, HttpCode, Post, UseGuards } from '@nestjs/common';

import { AuthenticatedUser, CurrentUser } from '../common/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { UsersService } from '../users/users.service';
import { AuthService } from './auth.service';
import { SigninDto } from './dto/signin.dto';
import { SignupDto } from './dto/signup.dto';

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
}
