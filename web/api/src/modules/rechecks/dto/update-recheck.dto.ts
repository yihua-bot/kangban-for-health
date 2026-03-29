import { PartialType } from '@nestjs/swagger';
import { CreateRecheckDto } from './create-recheck.dto';

export class UpdateRecheckDto extends PartialType(CreateRecheckDto) {}
