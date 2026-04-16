import { createApp, ref, computed, onMounted, watch } from "https://unpkg.com/vue@3/dist/vue.esm-browser.prod.js";
import { getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut, connectAuthEmulator } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js";
import { getFirestore, collection, addDoc, setDoc, deleteDoc, query, where, orderBy, onSnapshot, updateDoc, doc, serverTimestamp, getDocs, Timestamp, writeBatch, getDoc, limit, connectFirestoreEmulator, runTransaction } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-app.js";

// CONFIGURATION FIREBASE
const firebaseConfig = {
    apiKey: "AIzaSyA255n3XWDRKaYZ9kwOYkfovf5lRexoCA4",
    authDomain: "caisse-amt-perso.firebaseapp.com",
    projectId: "caisse-amt-perso",
    storageBucket: "caisse-amt-perso.firebasestorage.app",
    messagingSenderId: "682789156997",
    appId: "1:682789156997:web:9ce3303120851d37be91ec"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

console.log("✅ Mode Production (Salaire) : Connecté");

 createApp({
    setup() {
        const user = ref(null);
        const authLoading = ref(true);
        const loginForm = ref({ email: '', password: '' });
        const loginError = ref('');
        const isAdmin = computed(() => {
            const role = sessionStorage.getItem('userRole');
            return role === 'admin' || role === 'super_admin';
        });
        const isSuperAdmin = computed(() => {
            const role = sessionStorage.getItem('userRole');
            return role === 'super_admin';
        });

        const currentSalaireView = ref('dashboard'); 
        const employeesList = ref([]);
        const salaryHistory = ref([]);
        const salaryFunds = ref([]); 
        const paiePeriod = ref("15"); 
        
        const showAddEmployeeModal = ref(false);
        const showEditEmployeeModal = ref(false); 
        const showIndividualHistoryModal = ref(false); 
        const showPayModal = ref(false);
        const showFundModal = ref(false);
        const showDebtModal = ref(false);

        const newEmp = ref({ name: '', salary: 0, loan: 0, tontineCount: 0 });
        const editingEmp = ref({}); 
        const selectedEmployeeHistoryId = ref(null);
        const selectedEmployeeHistoryName = ref('');
        const payForm = ref({});
        const newFund = ref({ amount: '', note: '' });
        
        const globalTontineAmount = ref(10000);
        const selectedBudgetMonth = ref(new Date().toISOString().slice(0, 7));
        const selectedPaieMonth = ref(new Date().toISOString().slice(0, 7));
        const selectedTontineMonth = ref(new Date().toISOString().slice(0, 7));
        const selectedTontinePeriod = ref("15");
        const selectedHistoryMonth = ref(null);
        const searchQuery = ref('');
        const toast = ref({ show: false, message: '', type: 'success' });
        const actionLoading = ref(false);

        // --- CHARGEMENT DES DONNÉES ---
        const loadEmployees = () => {
             onSnapshot(collection(db, "employees"), (snap) => {
                let list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
                list.sort((a, b) => a.name.localeCompare(b.name));
                employeesList.value = list;
            });
        };

        const loadSalaryHistory = () => {
             onSnapshot(query(collection(db, "salary_payments"), orderBy('timestamp', 'desc')), (snap) => {
                salaryHistory.value = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            });
        };

        const loadSalaryFunds = () => {
             onSnapshot(query(collection(db, "salary_funds"), orderBy('timestamp', 'desc')), (snap) => {
                salaryFunds.value = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            });
        };

        // ============================================================
        // CORRECTION 1 — getMonthlySummary : distinguer les périodes
        // On calcule séparément ce qui a été payé à l'acompte (15)
        // et au solde (30), pour éviter que la tontine du 15 efface
        // celle du 30 dans le calcul de la base.
        // ============================================================
        const getMonthlySummary = (emp, month) => {
            const payments = salaryHistory.value.filter(p => p.employeeId === emp.id && p.month === month);
            
            const totalNetPaid = payments.reduce((sum, p) => sum + (p.net || 0), 0);
            const totalLoanPaid = payments.reduce((sum, p) => sum + (p.loan || 0), 0);
            const totalTontinePaid = payments.reduce((sum, p) => sum + (p.tontine || 0), 0);
            
            // FIX : Le montant brut consommé correspond à la base cible enregistrée (p.base).
            // Il faut utiliser p.base pour inclure indirectement les absences, sinon une 
            // absence déduite le 15 sera remboursée par erreur lors du calcul du solde le 30 !
            const totalGrossPaid = payments.reduce((sum, p) => sum + (p.base || 0), 0);

            return { totalNetPaid, totalLoanPaid, totalTontinePaid, totalGrossPaid };
        };

        // ============================================================
        // CORRECTION 2 — calculateBase : La base de paie ne doit
        // concerner que le salaire. La tontine est une DÉDUCTION.
        //
        // Règle métier :
        //   Acompte (15) → base = 50% du salaire
        //   Solde   (30) → base = 100% du salaire
        //
        // Le montant déjà payé (totalGrossPaid) est ensuite soustrait
        // pour déterminer ce qu'il reste à verser sur cette base.
        // ============================================================
        const calculateBase = (emp) => {
            const summary = getMonthlySummary(emp, selectedPaieMonth.value);

            if (paiePeriod.value === '15') {
                // Cible brute acompte = 50% du salaire
                const target = Math.round(emp.salary / 2);
                const remaining = target - summary.totalGrossPaid;
                return Math.max(0, remaining);
            }
            
            if (paiePeriod.value === '30') {
                // Cible brute mois entier = 100% du salaire
                const target = emp.salary;
                const remaining = target - summary.totalGrossPaid;
                return Math.max(0, remaining);
            }
            return 0;
        };

        // ============================================================
        // CORRECTION 3 — calculateTontineDeduc : Gère le rattrapage.
        // Règle métier :
        // - Le 15 : on prélève 1 part de tontine.
        // - Le 30 : on prélève le reste pour atteindre 2 parts sur le mois.
        //   Si la part du 15 a été manquée, on prélève 2 parts le 30.
        // ============================================================
        const calculateTontineDeduc = (emp) => {
            const count = parseInt(emp.tontineCount || (emp.isTontine ? 1 : 0));
            if (count <= 0) return 0;
            
            const tontinePerPeriod = count * (parseFloat(globalTontineAmount.value) || 0);
            const currentP = paiePeriod.value; // '15' ou '30'

            if (currentP === '15') {
                // Pour l'acompte, on ne prélève que la tontine de la 1ère période si elle n'a pas été payée.
                const paidThisPeriod = salaryHistory.value.filter(p => 
                    p.employeeId === emp.id && 
                    p.month === selectedPaieMonth.value && 
                    p.period === '15'
                ).reduce((sum, p) => sum + (parseFloat(p.tontine) || 0), 0);

                return Math.max(0, tontinePerPeriod - paidThisPeriod);
            }

            if (currentP === '30') {
                // Pour le solde, on s'assure que le total des 2 tontines du mois est bien prélevé.
                const totalMonthlyTarget = tontinePerPeriod * 2;

                // On calcule tout ce qui a déjà été payé en tontine pour ce mois (périodes 15 et 30 confondues)
                const totalPaidThisMonth = salaryHistory.value.filter(p => 
                    p.employeeId === emp.id && 
                    p.month === selectedPaieMonth.value
                ).reduce((sum, p) => sum + (parseFloat(p.tontine) || 0), 0);

                // La déduction est ce qui reste à payer pour atteindre la cible mensuelle.
                return Math.max(0, totalMonthlyTarget - totalPaidThisMonth);
            }

            return 0; // Ne devrait pas arriver
        };

        // Calcul Prêt (inchangé)
        const calculateLoanDeduc = (emp) => {
            if (!emp.loan || emp.loan <= 0) return 0;
            const standardDeduc = Math.min(emp.loan, 10000);
            const base = calculateBase(emp);
            const tontine = calculateTontineDeduc(emp);
            const available = Math.max(0, base - tontine);
            return Math.min(standardDeduc, available);
        };

        // Calcul du Net
        const calculateNet = (emp) => {
            const base = calculateBase(emp);
            const loan = calculateLoanDeduc(emp);
            const tontine = calculateTontineDeduc(emp);
            return Math.max(0, base - loan - tontine);
        };

        // Liste des impayés
        const unpaidEmployees = computed(() => {
            return employeesList.value.filter(emp => {
                const remaining = calculateBase(emp);
                return remaining > 0;
            });
        });

        const paieTotals = computed(() => {
            let t = { base: 0, loan: 0, tontine: 0, net: 0 };
            unpaidEmployees.value.forEach(emp => {
                t.base += calculateBase(emp);
                t.loan += calculateLoanDeduc(emp);
                t.tontine += calculateTontineDeduc(emp);
                t.net += calculateNet(emp);
            });
            return t;
        });

        const employeesTotals = computed(() => {
            return employeesList.value.reduce((acc, emp) => {
                acc.salary += (parseFloat(emp.salary) || 0);
                acc.loan += (parseFloat(emp.loan) || 0);
                const count = parseInt(emp.tontineCount || (emp.isTontine ? 1 : 0));
                // CORRECTION 4 : la tontine mensuelle = 2 × le montant unitaire
                acc.tontine += count * (parseFloat(globalTontineAmount.value) || 0) * 2;
                return acc;
            }, { salary: 0, loan: 0, tontine: 0 });
        });

        const filteredEmployees = computed(() => {
            if (!searchQuery.value) return employeesList.value;
            const q = searchQuery.value.toLowerCase();
            return employeesList.value.filter(emp => 
                emp.name.toLowerCase().includes(q)
            );
        });

        const showToast = (msg, type = 'success') => {
            toast.value = { show: true, message: msg, type };
            setTimeout(() => toast.value.show = false, 3000);
        };

        // --- ACTIONS ---

        const openPayModal = (emp) => {
            const baseAmount = calculateBase(emp);
            const suggestedLoan = calculateLoanDeduc(emp);
            const tontineAmount = calculateTontineDeduc(emp);

            const count = parseInt(emp.tontineCount || (emp.isTontine ? 1 : 0));
            const tontineTotal = count * (parseFloat(globalTontineAmount.value) || 0);

            payForm.value = {
                id: emp.id, 
                name: emp.name, 
                month: selectedPaieMonth.value,
                base: baseAmount,
                loan: suggestedLoan, 
                maxLoan: emp.loan || 0,
                tontine: tontineAmount,
                tontineTotal: tontineTotal,
                absence: 0,
                net: baseAmount - suggestedLoan - tontineAmount
            };
            showPayModal.value = true;
        };

        const recalcNet = () => {
            if (payForm.value.loan > payForm.value.maxLoan) payForm.value.loan = payForm.value.maxLoan;
            payForm.value.net = payForm.value.base - (payForm.value.loan || 0) - (payForm.value.tontine || 0) - (payForm.value.absence || 0);
        };

        const updateBaseFromNet = () => {
            payForm.value.base = (parseFloat(payForm.value.net) || 0) + (parseFloat(payForm.value.loan) || 0) + (parseFloat(payForm.value.tontine) || 0) + (parseFloat(payForm.value.absence) || 0);
        };

        const confirmSalaryPayment = async () => {
            if(!isSuperAdmin.value) return;
            const hasBudget = salaryFunds.value.some(f => f.targetMonth === payForm.value.month);
            if (!hasBudget) {
                alert(`Impossible d'effectuer un paiement pour ${payForm.value.month} : Aucun fonds n'a été alloué pour ce mois.`);
                return;
            }
            actionLoading.value = true;

            try {
                await runTransaction(db, async (transaction) => {
                    const empRef = doc(db, "employees", payForm.value.id);
                    const empDoc = await transaction.get(empRef);
                    if (!empDoc.exists()) throw "Employé introuvable !";

                    const currentLoan = empDoc.data().loan || 0;
                    const newLoan = Math.max(0, currentLoan - payForm.value.loan);

                    const newPaymentRef = doc(collection(db, "salary_payments"));
                    transaction.set(newPaymentRef, {
                        employeeId: payForm.value.id, 
                        employeeName: payForm.value.name, 
                        month: payForm.value.month,
                        type: paiePeriod.value === '15' ? 'Acompte (15)' : 'Solde (Fin)',
                        base: payForm.value.base, 
                        period: paiePeriod.value,
                        loan: payForm.value.loan, 
                        tontine: payForm.value.tontine, 
                        absence: payForm.value.absence || 0,
                        net: payForm.value.net,
                        timestamp: Timestamp.now()
                    });

                    if (payForm.value.loan > 0) {
                        transaction.update(empRef, { loan: newLoan });
                    }
                });
                
                showPayModal.value = false;
                showToast("Paiement enregistré avec succès !", "success");
            } catch(e) { showToast("Erreur: " + e.message, "error"); }
            finally { actionLoading.value = false; }
        };

        const saveGlobalTontine = async () => {
            if(!isSuperAdmin.value) return;
            try {
                await setDoc(doc(db, "settings", "salary"), { tontineAmount: globalTontineAmount.value }, { merge: true });
                showToast("Nouveau montant de tontine enregistré !");
            } catch(e) { showToast("Erreur : " + e.message, "error"); }
        };

        const saveNewEmployee = async () => {
            if(!isSuperAdmin.value) return;
            if(!newEmp.value.name) return;
            actionLoading.value = true;
            try {
                await addDoc(collection(db, "employees"), { 
                    name: newEmp.value.name, salary: newEmp.value.salary || 0, loan: newEmp.value.loan || 0, tontineCount: newEmp.value.tontineCount || 0, isTontine: (newEmp.value.tontineCount || 0) > 0
                });
                showAddEmployeeModal.value = false;
                newEmp.value = { name: '', salary: 0, loan: 0, tontineCount: 0 };
                showToast("Employé ajouté avec succès !");
            } catch(e) { showToast("Erreur: " + e.message, "error"); }
            finally { actionLoading.value = false; }
        };

        const openEditEmployee = (emp) => { editingEmp.value = { ...emp }; showEditEmployeeModal.value = true; };
        const updateEmployee = async () => {
            if(!isSuperAdmin.value) return;
            actionLoading.value = true;
            try {
                await updateDoc(doc(db, "employees", editingEmp.value.id), { name: editingEmp.value.name, salary: editingEmp.value.salary, loan: editingEmp.value.loan, tontineCount: editingEmp.value.tontineCount || 0, isTontine: (editingEmp.value.tontineCount || 0) > 0 });
                showEditEmployeeModal.value = false;
                showToast("Modifications enregistrées !");
            } catch(e) { showToast("Erreur: " + e.message, "error"); }
            finally { actionLoading.value = false; }
        };
        const deleteEmployee = async (id) => { 
            if(!isSuperAdmin.value) return;
            if(confirm("Supprimer cet employé ?")) await deleteDoc(doc(db, "employees", id)); 
        };

        const cancelTontine = async (emp) => {
            if(!isSuperAdmin.value) return;
            if (!confirm(`Voulez-vous vraiment annuler toutes les parts de tontine pour ${emp.name} ?`)) return;
            try {
                await updateDoc(doc(db, "employees", emp.id), { tontineCount: 0, isTontine: false });
                showToast(`La tontine pour ${emp.name} a été annulée.`);
            } catch (e) { showToast("Erreur : " + e.message, "error"); }
        };

        const deleteSalaryPayment = async (payment) => {
             if(!isSuperAdmin.value) return;
             if(!confirm("Annuler ce paiement ?")) return;
             try {
                if(payment.loan > 0) {
                    const emp = employeesList.value.find(e => e.id === payment.employeeId);
                    if(emp) await updateDoc(doc(db, "employees", payment.employeeId), { loan: emp.loan + payment.loan });
                }
                await deleteDoc(doc(db, "salary_payments", payment.id));
                showToast("Paiement annulé.");
             } catch(e) { showToast("Erreur: " + e.message, "error"); }
        };

        const openIndividualHistory = (emp) => { selectedEmployeeHistoryId.value = emp.id; selectedEmployeeHistoryName.value = emp.name; showIndividualHistoryModal.value = true; };
        
        const individualHistory = computed(() => {
            if (!selectedEmployeeHistoryId.value) return [];
            return salaryHistory.value
                .filter(p => p.employeeId === selectedEmployeeHistoryId.value)
                .sort((a, b) => (b.timestamp?.seconds || 0) - (a.timestamp?.seconds || 0));
        });

        // ============================================================
        // CORRECTION 5 — groupedSalaryHistory : décomposer le solde
        // On distingue maintenant : totalNet (net payé aux employés),
        // totalTontine (retenues tontine collectées), totalLoan
        // (remboursements de prêts), et on calcule le balance correct.
        // ============================================================
        const groupedSalaryHistory = computed(() => {
            const groups = {};
            salaryHistory.value.forEach(pay => {
                if (!groups[pay.month]) groups[pay.month] = { 
                    month: pay.month, 
                    payments: [], 
                    totalNet: 0,      // Net versé à l'employé
                    totalTontine: 0,  // Tontine collectée (retenues)
                    totalLoan: 0,     // Remboursements prêts
                    totalFund: 0      // Budget alloué
                };
                groups[pay.month].payments.push(pay);
                groups[pay.month].totalNet += (pay.net || 0);
                groups[pay.month].totalTontine += (pay.tontine || 0);
                groups[pay.month].totalLoan += (pay.loan || 0);
            });
            salaryFunds.value.forEach(fund => {
                const m = fund.targetMonth;
                if (!groups[m]) groups[m] = { month: m, payments: [], totalNet: 0, totalTontine: 0, totalLoan: 0, totalFund: 0 };
                groups[m].totalFund += fund.amount;
            });
            return Object.values(groups)
                .sort((a, b) => b.month.localeCompare(a.month))
                .map(group => ({ 
                    ...group, 
                    // Le budget consommé = net versé + tontine retenue
                    // (les remboursements de prêt ne consomment pas le budget, 
                    //  ils transitent par l'employé)
                    totalSpent: group.totalNet + group.totalTontine,
                    balance: group.totalFund - group.totalNet - group.totalTontine
                }));
        });

        const openMonthDetails = (group) => { group.payments.sort((a, b) => b.timestamp.seconds - a.timestamp.seconds); selectedHistoryMonth.value = group; };
        const closeMonthDetails = () => { selectedHistoryMonth.value = null; };

        const saveSalaryFund = async () => {
            if(!isSuperAdmin.value) return;
            if(!newFund.value.amount) return;
            actionLoading.value = true;
            try { 
                await addDoc(collection(db, "salary_funds"), { amount: newFund.value.amount, note: newFund.value.note || 'Dotation', targetMonth: newFund.value.targetMonth || selectedBudgetMonth.value, timestamp: Timestamp.now() }); 
                showFundModal.value = false; newFund.value = { amount: '', note: '', targetMonth: selectedBudgetMonth.value }; showToast("Fonds enregistrés !"); 
            } catch(e) { showToast(e.message, "error"); }
            finally { actionLoading.value = false; }
        };
        const deleteSalaryFund = async (id) => { 
            if(!isSuperAdmin.value) return;
            if(confirm("Supprimer ?")) await deleteDoc(doc(db, "salary_funds", id)); 
        };

        // ============================================================
        // CORRECTION 6 — salaryStats : inclure la tontine dans
        // le total dépensé pour un bilan budget correct.
        // ============================================================
        const salaryStats = computed(() => {
            const target = selectedBudgetMonth.value;
            const targetPayments = salaryHistory.value.filter(p => p.month === target);
            const totalReceived = salaryFunds.value
                .filter(f => (f.targetMonth || (f.timestamp?.toDate ? f.timestamp.toDate().toISOString().slice(0, 7) : '')) === target)
                .reduce((acc, curr) => acc + (curr.amount || 0), 0);
            // CORRECTION : totalPaid = net versé + tontines retenues
            const totalNet = targetPayments.reduce((acc, curr) => acc + (curr.net || 0), 0);
            const totalTontine = targetPayments.reduce((acc, curr) => acc + (curr.tontine || 0), 0);
            const totalPaid = totalNet + totalTontine;
            const totalLoans = employeesList.value.reduce((acc, curr) => acc + (curr.loan || 0), 0);
            return { totalReceived, totalNet, totalTontine, totalPaid, balance: totalReceived - totalPaid, totalLoans };
        });

        const tontineMembers = computed(() => {
            let list = [];
            employeesList.value.forEach(e => {
                const count = parseInt(e.tontineCount || (e.isTontine ? 1 : 0));
                for(let i=1; i<=count; i++) {
                    list.push({ ...e, shareIndex: i, uniqueId: e.id + '_' + i });
                }
            });
            return list;
        });

        // ============================================================
        // CORRECTION 7 — hasPaidTontine : utilise selectedTontineMonth
        // ET selectedTontinePeriod (déjà correct en soi), mais on
        // s'assure que la comparaison est bien sur p.period.
        // ============================================================
        const hasPaidTontine = (empId, shareIndex = 1) => {
            const currentMonth = selectedTontineMonth.value;
            const currentPeriod = selectedTontinePeriod.value;
            const totalPaid = salaryHistory.value
                .filter(p => 
                    p.employeeId === empId && 
                    p.month === currentMonth && 
                    p.period === currentPeriod  // comparaison stricte sur la période
                )
                .reduce((sum, p) => sum + (parseFloat(p.tontine) || 0), 0);
            return totalPaid >= (shareIndex * (parseFloat(globalTontineAmount.value) || 0));
        };

        // ============================================================
        // CORRECTION 8 — hasPaidTontineForPaie : nouvelle fonction
        // utilisée dans l'onglet Employés pour afficher le badge
        // "Payé/Non Payé" basé sur le MOIS DE PAIE (selectedPaieMonth)
        // et non le mois tontine.
        // ============================================================
        const hasPaidTontineForPaie = (empId, shareIndex = 1) => {
            const currentMonth = selectedPaieMonth.value;
            // On vérifie les deux périodes (le 15 et le 30)
            const totalPaid = salaryHistory.value
                .filter(p => p.employeeId === empId && p.month === currentMonth)
                .reduce((sum, p) => sum + (parseFloat(p.tontine) || 0), 0);
            const expectedPerMonth = shareIndex * (parseFloat(globalTontineAmount.value) || 0) * 2;
            return totalPaid >= expectedPerMonth;
        };

        // ============================================================
        // CORRECTION 9 — tontinePot : la cagnotte = 2 prélèvements/mois
        // ============================================================
        const tontinePot = computed(() => {
            const totalShares = employeesList.value.reduce((sum, e) => sum + (parseInt(e.tontineCount || (e.isTontine ? 1 : 0))), 0);
            // Cagnotte mensuelle = 2 périodes × montant unitaire × nombre de parts
            return totalShares * (parseFloat(globalTontineAmount.value) || 0) * 2;
        });

        const getTontinePaidAmount = (empId) => {
            const currentMonth = selectedTontineMonth.value;
            const currentPeriod = selectedTontinePeriod.value;
            return salaryHistory.value
                .filter(p => p.employeeId === empId && p.month === currentMonth && p.period === currentPeriod)
                .reduce((sum, p) => sum + (parseFloat(p.tontine) || 0), 0);
        };

        // ============================================================
        // CORRECTION 10 — markTontinePayment : stocker la tontine dans
        // le budget (inclure le montant dans net pour que salaryStats
        // le comptabilise correctement, ou utiliser un champ dédié).
        // On utilise désormais net = 0 et tontine = amount, et la
        // correction de salaryStats (ci-dessus) s'en charge.
        // ============================================================
        const markTontinePayment = async (emp) => {
            if(!isSuperAdmin.value) return;
            let amount = prompt("Montant de la cotisation pour " + emp.name + " ?", globalTontineAmount.value);
            if (amount === null) return;
            amount = parseFloat(amount);
            if (isNaN(amount) || amount <= 0) return alert("Montant invalide");

            try {
                const currentMonth = selectedTontineMonth.value;
                await addDoc(collection(db, "salary_payments"), {
                    employeeId: emp.id, 
                    employeeName: emp.name, 
                    month: currentMonth,
                    period: selectedTontinePeriod.value,
                    type: 'Cotisation Tontine',
                    base: 0, 
                    loan: 0, 
                    tontine: amount,  // Correctement enregistré dans tontine
                    net: 0,
                    timestamp: Timestamp.now()
                });
                showToast("Cotisation enregistrée !");
            } catch(e) { showToast("Erreur: " + e.message, "error"); }
        };

        const tontineBeneficiaries = computed(() => {
            return salaryHistory.value.filter(p => 
                p.month === selectedTontineMonth.value && 
                p.period === selectedTontinePeriod.value &&
                p.type === 'Gain Tontine'
            );
        });

        const hasReceivedTontine = (emp) => {
            const wins = salaryHistory.value.filter(p => p.employeeId === emp.id && p.type === 'Gain Tontine').length;
            const allowed = parseInt(emp.tontineCount || (emp.isTontine ? 1 : 0));
            return wins >= allowed;
        };

        const markTontineBeneficiary = async (emp) => {
            if(!isSuperAdmin.value) return;
            const wins = salaryHistory.value.filter(p => p.employeeId === emp.id && p.type === 'Gain Tontine').length;
            const allowed = parseInt(emp.tontineCount || (emp.isTontine ? 1 : 0));
            if (wins >= allowed) {
                return alert(`Impossible : Cet employé a déjà récupéré la tontine ${wins} fois (Nombre de parts : ${allowed}).`);
            }
            if (!confirm(`Confirmer que ${emp.name} récupère la tontine du mois (${selectedTontineMonth.value}) ?`)) return;
            const totalShares = employeesList.value.reduce((sum, e) => sum + (parseInt(e.tontineCount || (e.isTontine ? 1 : 0))), 0);
            // Gain = cagnotte du mois (2 périodes)
            const defaultAmount = totalShares * globalTontineAmount.value * 2;
            let amount = prompt("Montant récupéré ?", defaultAmount);
            if (amount === null) return;
            amount = parseFloat(amount);
            if (isNaN(amount) || amount <= 0) return alert("Montant invalide");
            try {
                await addDoc(collection(db, "salary_payments"), {
                    employeeId: emp.id, employeeName: emp.name, month: selectedTontineMonth.value, period: selectedTontinePeriod.value,
                    type: 'Gain Tontine', base: 0, loan: 0, tontine: 0, tontineGain: amount, net: 0, timestamp: Timestamp.now()
                });
                showToast("Gain enregistré !");
            } catch(e) { showToast("Erreur: " + e.message, "error"); }
        };

        const deleteTontineBeneficiary = async (payment) => { 
            if(!isSuperAdmin.value) return;
            if(confirm("Supprimer ce gain ?")) await deleteDoc(doc(db, "salary_payments", payment.id)); 
        };

        const exportSalaryHistoryPDF = () => {
            const doc = new jspdf.jsPDF();
            doc.setFontSize(18);
            doc.setTextColor(40);
            doc.text("Rapport Détaillé des Salaires", 14, 20);
            doc.setFontSize(10);
            doc.setTextColor(100);
            doc.text("Généré le : " + new Date().toLocaleString(), 14, 28);
            let currentY = 35;

            groupedSalaryHistory.value.forEach(group => {
                if (currentY > 250) { doc.addPage(); currentY = 20; }

                doc.setFillColor(245, 247, 250);
                doc.setDrawColor(200, 200, 200);
                doc.roundedRect(14, currentY, 182, 22, 2, 2, 'FD');
                
                doc.setFontSize(12);
                doc.setTextColor(0);
                doc.setFont("helvetica", "bold");
                doc.text(`Période : ${group.month}`, 20, currentY + 8);
                
                doc.setFontSize(9);
                doc.setFont("helvetica", "normal");
                
                const budgetTxt = `Budget: ${formatMoney(group.totalFund)}`;
                const payeTxt = `Net versé: ${formatMoney(group.totalNet)}`;
                // CORRECTION PDF : afficher la tontine collectée séparément
                const tontineTxt = `Tontine collectée: ${formatMoney(group.totalTontine)}`;
                const soldeTxt = `Reste: ${formatMoney(group.balance)}`;
                
                doc.text(budgetTxt, 20, currentY + 15);
                doc.setTextColor(75, 85, 99);
                doc.text(payeTxt, 65, currentY + 15);
                doc.setTextColor(234, 88, 12); // Orange
                doc.text(tontineTxt, 110, currentY + 15);
                if (group.balance < 0) doc.setTextColor(220, 38, 38);
                else doc.setTextColor(22, 163, 74);
                doc.text(soldeTxt, 160, currentY + 15);

                const sortedPayments = [...group.payments].sort((a, b) => b.timestamp.seconds - a.timestamp.seconds);
                const tableBody = sortedPayments.map(p => [
                    formatDate(p.timestamp),
                    p.employeeName,
                    p.type,
                    p.tontine > 0 ? formatMoney(p.tontine) : '-', // CORRECTION : afficher tontine
                    p.loan > 0 ? formatMoney(p.loan) : '-',
                    p.absence > 0 ? formatMoney(p.absence) : '-',
                    formatMoney(p.net)
                ]);

                if (tableBody.length === 0) {
                    tableBody.push(['-', 'Aucun paiement enregistré', '-', '-', '-', '-', '-']);
                }

                doc.autoTable({
                    startY: currentY + 26,
                    head: [['Date', 'Employé', 'Type', 'Tontine', 'Prêt', 'Abs.', 'Net Payé']],
                    body: tableBody,
                    theme: 'grid',
                    headStyles: { fillColor: [79, 70, 229], textColor: 255, fontStyle: 'bold' },
                    styles: { fontSize: 9, cellPadding: 3 },
                    columnStyles: {
                        0: { cellWidth: 22 },
                        3: { halign: 'right', cellWidth: 22, textColor: [234, 88, 12] },
                        4: { halign: 'right', cellWidth: 20 },
                        5: { halign: 'right', cellWidth: 16 },
                        6: { halign: 'right', fontStyle: 'bold', cellWidth: 28 }
                    },
                    margin: { left: 14, right: 14 },
                    didDrawPage: (data) => { currentY = data.cursor.y; }
                });

                currentY = doc.lastAutoTable.finalY + 15;
            });

            doc.save("Rapport_Salaires_Complet.pdf");
        };

        const printPayslip = (payment) => {
            const doc = new jspdf.jsPDF();
            doc.setFontSize(16);
            doc.setTextColor(79, 70, 229);
            doc.text("BULLETIN DE PAIE", 105, 20, null, null, "center");
            doc.setFontSize(10);
            doc.setTextColor(0);
            doc.text(`Date : ${formatDate(payment.timestamp)}`, 14, 35);
            doc.text(`Période : ${payment.month}`, 14, 40);
            doc.text(`Type : ${payment.type}`, 14, 45);
            doc.setFontSize(12);
            doc.text(`Employé : ${payment.employeeName}`, 14, 55);
            const body = [
                ['Salaire de Base / Avance', formatMoney(payment.base)],
                ['Remboursement Prêt', `-${formatMoney(payment.loan)}`],
                ['Retenue Tontine', `-${formatMoney(payment.tontine)}`],
                ['Absence / Autre', `-${formatMoney(payment.absence)}`],
                [{content: 'NET À PAYER', styles: {fontStyle: 'bold', fillColor: [240, 240, 240]}}, {content: formatMoney(payment.net), styles: {fontStyle: 'bold', fillColor: [240, 240, 240], textColor: [79, 70, 229]}}]
            ];
            doc.autoTable({
                startY: 65,
                head: [['Désignation', 'Montant']],
                body: body,
                theme: 'grid',
                columnStyles: { 1: { halign: 'right' } }
            });
            const finalY = doc.lastAutoTable.finalY + 20;
            doc.setFontSize(10);
            doc.text("Signature Employé :", 140, finalY);
            doc.text("Signature Direction :", 14, finalY);
            doc.save(`Bulletin_${payment.employeeName}_${payment.month}.pdf`);
        };

        // --- GESTION CRÉANCES ---
        const selectedDebtEmployee = ref(null);
        const openDebtModal = (emp) => { selectedDebtEmployee.value = emp; showDebtModal.value = true; };
        const debtRepaymentHistory = computed(() => {
            if (!selectedDebtEmployee.value) return [];
            return salaryHistory.value
                .filter(p => p.employeeId === selectedDebtEmployee.value.id && (p.loan || 0) > 0)
                .sort((a, b) => (b.timestamp?.seconds || 0) - (a.timestamp?.seconds || 0));
        });
        const getEmployeeRepaidTotal = (empId) => salaryHistory.value.filter(p => p.employeeId === empId).reduce((sum, p) => sum + (p.loan || 0), 0);

        // --- DASHBOARD DATA ---
        const dashboardStats = computed(() => {
            return {
                employeesCount: employeesList.value ? employeesList.value.length : 0,
                toPayCount: unpaidEmployees.value ? unpaidEmployees.value.length : 0,
                budgetBalance: salaryStats.value ? salaryStats.value.balance : 0,
                tontinePot: tontinePot.value || 0
            };
        });

        const recentActivity = computed(() => salaryHistory.value.slice(0, 8));

        const formatMoney = (m) => {
            if (!m && m !== 0) return '0 F';
            return new Intl.NumberFormat('fr-FR').format(m).replace(/\s/g, ' ') + ' F';
        };
        const formatDate = (ts) => { if (!ts) return '-'; const d = ts.toDate ? ts.toDate() : new Date(ts); const day = d.getDate().toString().padStart(2, '0'); let month = d.toLocaleString('fr-FR', { month: 'short' }).replace('.', ''); month = month.charAt(0).toUpperCase() + month.slice(1); const year = d.getFullYear(); return `${day}-${month}-${year}`; };
        
        const login = async () => { try { await signInWithEmailAndPassword(auth, loginForm.value.email, loginForm.value.password); } catch (e) { loginError.value = "Erreur de connexion"; } };
        const logout = async () => { await signOut(auth); window.location.href = 'login.html'; };

        onAuthStateChanged(auth, (u) => {
            user.value = u; authLoading.value = false;
            if (u) {
                loadEmployees(); loadSalaryHistory(); loadSalaryFunds();
                onSnapshot(doc(db, "settings", "salary"), (docSnap) => { if (docSnap.exists()) globalTontineAmount.value = docSnap.data().tontineAmount || 10000; });
                initBackToTopButton();
            }
        });

        return {
            user, isAdmin, isSuperAdmin, authLoading, loginForm, login, logout, loginError,
            formatMoney, formatDate,
            currentSalaireView, employeesList, salaryHistory, salaryFunds, paiePeriod, selectedPaieMonth,
            showAddEmployeeModal, showEditEmployeeModal, showIndividualHistoryModal, showPayModal, showFundModal,
            newEmp, editingEmp, payForm, newFund, unpaidEmployees, selectedEmployeeHistoryName, individualHistory,
            groupedSalaryHistory, selectedHistoryMonth, openMonthDetails, closeMonthDetails, searchQuery, filteredEmployees,
            saveNewEmployee, updateEmployee, deleteEmployee, openEditEmployee, openIndividualHistory, selectedBudgetMonth, cancelTontine,
            openPayModal, confirmSalaryPayment, deleteSalaryPayment, recalcNet, updateBaseFromNet, 
            hasPaidTontine, hasPaidTontineForPaie, // AJOUT : nouvelle fonction pour l'onglet employés
            getTontinePaidAmount, markTontinePayment, tontineMembers, globalTontineAmount, saveGlobalTontine, selectedTontineMonth, tontinePot,
            calculateBase, calculateLoanDeduc, calculateTontineDeduc, calculateNet, exportSalaryHistoryPDF, printPayslip, paieTotals, employeesTotals,
            saveSalaryFund, deleteSalaryFund, salaryStats, selectedTontinePeriod,
            tontineBeneficiaries, markTontineBeneficiary, deleteTontineBeneficiary, hasReceivedTontine,
            toast, actionLoading,
            showDebtModal, selectedDebtEmployee, openDebtModal, debtRepaymentHistory, getEmployeeRepaidTotal,
            dashboardStats, recentActivity
        };
    }
 }).mount('#app');