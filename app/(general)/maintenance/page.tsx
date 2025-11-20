import { Suspense } from 'react';
import MaintenanceForm from '@/components/maintenance/MaintenanceForm';

export default function MaintenancePage() {
  return (
    <Suspense>
      <MaintenanceForm />
    </Suspense>
  );
}
