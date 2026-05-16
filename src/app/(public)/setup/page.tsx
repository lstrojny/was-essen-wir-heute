import { redirectIfNotFirstRun } from '@/auth/guards'
import { SetupForm } from './SetupForm'

export default async function SetupPage() {
    await redirectIfNotFirstRun()
    return <SetupForm />
}
