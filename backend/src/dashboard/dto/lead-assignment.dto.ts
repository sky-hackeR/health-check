import { IsOptional, IsUUID } from 'class-validator';

export class LeadAssignmentDto {
  @IsOptional()
  @IsUUID()
  assignedAdminId?: string | null;
}
