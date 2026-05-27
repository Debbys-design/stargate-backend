import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { z } from "zod";

const fundSchema = z.object({
  public_key: z.string().min(56).max(56),
});

const FRIENDBOT_URL = "https://friendbot.stellar.org";

@Injectable()
export class DevService {
  constructor(private readonly config: ConfigService) {}

  async fundAccount(input: unknown) {
    if (this.config.get<string>("STELLAR_NETWORK") !== "testnet") {
      throw new ServiceUnavailableException(
        "Fund endpoint is only available on testnet",
      );
    }

    const { public_key } = fundSchema.parse(input);

    const url = `${FRIENDBOT_URL}?addr=${encodeURIComponent(public_key)}`;
    const response = await fetch(url);

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new BadRequestException(
        `Friendbot error (${response.status}): ${text}`,
      );
    }

    const data = await response.json();
    return {
      funded: true,
      public_key,
      transaction_hash: data?.hash ?? null,
    };
  }
}
