import { apiClient } from './client';
import type { ProgramDetailDTO, ProgramMaterialDTO } from '../types/api';

/**
 * Programs endpoints — exact contract from api/internal/programs, matching
 * apps/web/lib/programs-api.ts. Only the participant-facing reads the mobile
 * app actually needs (phases/modules/activities tree + program materials).
 */
export const programsApi = {
  get: (id: string) => apiClient.get<ProgramDetailDTO>(`/programs/${id}`),
  listMaterials: (programId: string) =>
    apiClient.get<ProgramMaterialDTO[]>(`/programs/${programId}/materials`),
};
