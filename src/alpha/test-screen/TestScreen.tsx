import { useMsal } from '@azure/msal-react'

import { useEffect, useState } from 'react'

type Mechanic = {
    gr_mechanicid: string
    gr_name: string
    gr_phone: string
    gr_email: string
}

function TestScreen() {
    const { instance, accounts } = useMsal()
    const account = accounts[0]
    const [name, setName] = useState('')
    const [phone, setPhone] = useState('')
    const [email, setEmail] = useState('')
    const [mechanics, setMechanics] = useState<Mechanic[]>([])

    const handleLogin = () => {
        instance.loginRedirect({
            scopes: [`${import.meta.env.VITE_DATAVERSE_URL}/user_impersonation`],
        })
    }
    const handleLogout = () => { instance.logoutPopup() }

    const fetchMechanics = async () => {
        const response = await instance.acquireTokenSilent({
            scopes: [`${import.meta.env.VITE_DATAVERSE_URL}/user_impersonation`],
            account,
        })

        const result = await fetch(
            `${import.meta.env.VITE_DATAVERSE_URL}/api/data/v9.2/gr_mechanics?$select=gr_mechanicid,gr_name,gr_phone,gr_email`,
            {
                headers: {
                    Authorization: `Bearer ${response.accessToken}`,
                    Accept: 'application/json',
                },
            },
        )

        const data = await result.json()
        setMechanics(data.value)
    }

    useEffect(() => {
        if (!account) return

        let cancelled = false

        const loadMechanics = async () => {
            const response = await instance.acquireTokenSilent({
                scopes: [`${import.meta.env.VITE_DATAVERSE_URL}/user_impersonation`],
                account,
            })
            const result = await fetch(
                `${import.meta.env.VITE_DATAVERSE_URL}/api/data/v9.2/gr_mechanics?$select=gr_mechanicid,gr_name,gr_phone,gr_email`,
                {
                    headers: {
                        Authorization: `Bearer ${response.accessToken}`,
                        Accept: 'application/json',
                    },
                },
            )
            const data = await result.json()

            if (!cancelled) setMechanics(data.value ?? [])
        }

        void loadMechanics()

        return () => {
            cancelled = true
        }
    }, [account, instance])

    const createMechanic = async () => {
        if (!name || !phone || !email) {
            alert('Please enter a name')
            return
        }

        const response = await instance.acquireTokenSilent({
            scopes: [`${import.meta.env.VITE_DATAVERSE_URL}/user_impersonation`],
            account,
        })

        const result = await fetch(
            `${import.meta.env.VITE_DATAVERSE_URL}/api/data/v9.2/gr_mechanics`,
            {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${response.accessToken}`,
                    'Content-Type': 'application/json',
                    Accept: 'application/json',
                },
                body: JSON.stringify({
                    gr_name: name,
                    gr_phone: phone,
                    gr_email: email,
                }),
            },
        )

        console.log(result.status)

        if (!result.ok) {
            const error = await result.text()
            console.error(error)
        }

        setName('')
        setPhone('')
        setEmail('')
        fetchMechanics()
    }

    return (
        <div>
            <h1>Mechanic Entry</h1>

            {accounts.length === 0 ? (
                <button onClick={handleLogin}>Login with Microsoft</button>
            ) : (
                <>
                    <input
                        type="text"
                        placeholder="Enter mechanic name"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                    />
                    <input
                        type="text"
                        placeholder="Enter mechanic phone"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                    />
                    <input
                        type="text"
                        placeholder="Enter mechanic email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                    />
                    <button onClick={createMechanic}>Create Mechanic</button>
                    <table>
                        <thead>
                            <tr>
                                <th>Name</th>
                                <th>Phone</th>
                                <th>Email</th>
                            </tr>
                        </thead>

                        <tbody>
                            {mechanics.map((mechanic) => (
                                <tr key={mechanic.gr_mechanicid}>
                                    <td>{mechanic.gr_name}</td>
                                    <td>{mechanic.gr_phone}</td>
                                    <td>{mechanic.gr_email}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>

                    <p>Logged in as: {accounts[0].username}</p>
                    <button onClick={handleLogout}>Logout</button>
                </>
            )}
        </div>
    )
}

export default TestScreen
