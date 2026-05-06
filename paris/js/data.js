export const appData = {
    invoices: [
        { id: 1, number: 'FAC-2024-001', client: 'Jean Dupont', amount: 380.00, status: 'payée', date: '2024-12-01' },
        { id: 2, number: 'FAC-2024-002', client: 'Marie Koné', amount: 275.50, status: 'envoyée', date: '2024-12-05' },
        { id: 3, number: 'FAC-2024-003', client: 'Ibrahim Touré', amount: 485.00, status: 'en_attente', date: '2024-12-10' }
    ],
    appointments: [
        { id: 1, client: 'Jean Dupont', date: '2024-12-15', time: '10:00', status: 'confirmé' },
        { id: 2, client: 'Marie Koné', date: '2024-12-16', time: '14:30', status: 'en_attente' },
        { id: 3, client: 'Ibrahim Touré', date: '2024-12-17', time: '09:00', status: 'confirmé' },
        { id: 4, client: 'Fatima Diallo', date: '2024-12-18', time: '11:00', status: 'en_attente' }
    ],
    quotes: [
        { id: 1, number: 'DEV-2024-001', client: 'Jean Dupont', amount: 220.00, status: 'envoyé', date: '2024-11-28' },
        { id: 2, number: 'DEV-2024-002', client: 'Société ABC', amount: 680.00, status: 'accepté', date: '2024-12-03' }
    ],
    quoteRequests: [
        { id: 1, client: 'Nouveau Client', email: 'client@email.com', date: '2024-12-12' },
        { id: 2, client: 'Entreprise XYZ', email: 'contact@xyz.com', date: '2024-12-13' }
    ],
    programs: [
        { id: 1, name: 'Programme Décembre 2024', startDate: '2024-12-01', endDate: '2024-12-31', status: 'en_cours' }
    ],
    drivers: [
        { id: 1, name: 'Jean-Marc', status: 'disponible', vehicle: 'Renault Master' },
        { id: 2, name: 'Sébastien', status: 'occupé', vehicle: 'Peugeot Trafic' }
    ],
    containers: [
        { id: 1, number: 'CONT-PAR-001', status: 'en_chargement', items: 45 },
        { id: 2, number: 'CONT-PAR-002', status: 'en_transit', items: 78 },
        { id: 3, number: 'CONT-PAR-003', status: 'arrivé', items: 32 }
    ],
    products: [
        { id: 1, name: 'Colis Standard', price: 15.00, stock: 150 },
        { id: 2, name: 'Malle / Fût', price: 45.00, stock: 25 },
        { id: 3, name: 'Colis Express', price: 25.00, stock: 80 }
    ],
    messages: [
        { id: 1, from: 'Client Jean', message: 'Bonjour, quel est le statut de mon colis ?', time: '10:30', read: false },
        { id: 2, from: 'Service Logistique', message: 'Le départ est prévu demain', time: '09:15', read: false }
    ],
    notifications: [
        { id: 1, title: 'Nouvelle facture', message: 'La facture FAC-2024-002 a été émise', time: '2024-12-05 14:30', read: false },
        { id: 2, title: 'Rappel RDV', message: 'RDV avec Jean Dupont demain 10h', time: '2024-12-14 08:00', read: false }
    ],
    agents: [
        { id: 1, name: 'Agent Paris 1', email: 'agent1@amtparis.fr', role: 'agent', active: true },
        { id: 2, name: 'Agent Paris 2', email: 'agent2@amtparis.fr', role: 'agent', active: true }
    ]
};