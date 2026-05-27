import { Body, Controller, HttpCode, Post } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { DevService } from "./dev.service";

@ApiTags("dev")
@Controller("dev")
export class DevController {
  constructor(private readonly dev: DevService) {}

  @Post("fund-account")
  @HttpCode(200)
  @ApiOperation({
    summary: "Fund a testnet account via Friendbot (testnet only)",
  })
  fund(@Body() body: unknown) {
    return this.dev.fundAccount(body);
  }
}
