import { redirectIfAuthenticated } from '@/auth/guards'
import { LoginForm } from './LoginForm'

export default async function LoginPage() {
    await redirectIfAuthenticated()
    return <LoginForm />
}
