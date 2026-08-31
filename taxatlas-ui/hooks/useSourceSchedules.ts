import { useQuery } from '@tanstack/react-query';
import { api } from '@/taxatlas-ui/lib/api';

export function useSourceSchedules() {
  return useQuery({
    queryKey: ['source-schedules'],
    queryFn: () => api.sources.schedules(),
    refetchInterval: 15_000,
  });
}
