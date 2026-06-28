import cors from 'cors';
import { randomUUID } from 'node:crypto';
import 'dotenv/config';
import express from 'express';
import multer from 'multer';
import { z } from 'zod';
const app = express();
const upload = multer({ dest: 'uploads/' });
const port = Number(process.env.PORT ?? 4000);
app.use(cors());
app.use(express.json());
const products = [
    { id: 'p1', name: 'Vodka premium', type: 'alcoholic', cost: 280, price: 520, stock: 12 },
    { id: 'p2', name: 'Agua mineral', type: 'non_alcoholic', cost: 4, price: 10, stock: 70 },
];
const reservations = [];
const sales = [];
const productSchema = z.object({
    name: z.string().min(2),
    type: z.enum(['alcoholic', 'non_alcoholic']),
    cost: z.number().nonnegative(),
    price: z.number().nonnegative(),
    stock: z.number().int().nonnegative(),
});
const reservationSchema = z.object({
    table: z.string().min(1),
    customerName: z.string().min(2),
    amount: z.number().nonnegative(),
});
const saleSchema = z.object({
    productId: z.string(),
    quantity: z.number().int().positive(),
    paymentMethod: z.enum(['cash', 'qr']),
    receivedAmount: z.number().nonnegative(),
});
app.get('/health', (_req, res) => {
    res.json({ ok: true, service: 'miami-space-backend' });
});
app.get('/products', (_req, res) => {
    res.json(products);
});
app.post('/products', (req, res) => {
    const input = productSchema.parse(req.body);
    const product = { id: randomUUID(), ...input };
    products.push(product);
    res.status(201).json(product);
});
app.get('/reservations', (_req, res) => {
    res.json(reservations);
});
app.post('/reservations', upload.single('voucher'), (req, res) => {
    const input = reservationSchema.parse(coerceBody(req.body));
    const reservation = {
        id: randomUUID(),
        ...input,
        status: 'pending_qr_review',
        voucherUrl: req.file?.path,
    };
    reservations.push(reservation);
    res.status(201).json(reservation);
});
app.post('/reservations/:id/confirm', (req, res) => {
    const reservation = reservations.find((item) => item.id === req.params.id);
    if (!reservation)
        return res.status(404).json({ message: 'Reservation not found' });
    reservation.status = 'confirmed';
    res.json(reservation);
});
app.get('/sales', (_req, res) => {
    res.json(sales);
});
app.post('/sales', upload.single('voucher'), (req, res) => {
    const input = saleSchema.parse(coerceBody(req.body));
    const product = products.find((item) => item.id === input.productId);
    if (!product)
        return res.status(404).json({ message: 'Product not found' });
    if (product.stock < input.quantity)
        return res.status(409).json({ message: 'Insufficient stock' });
    const total = product.price * input.quantity;
    const sale = {
        id: randomUUID(),
        ...input,
        changeAmount: input.paymentMethod === 'cash' ? Math.max(input.receivedAmount - total, 0) : 0,
        voucherUrl: req.file?.path,
        createdAt: new Date().toISOString(),
    };
    product.stock -= input.quantity;
    sales.push(sale);
    res.status(201).json(sale);
});
app.get('/reports/summary', (_req, res) => {
    const summary = sales.reduce((acc, sale) => {
        const product = products.find((item) => item.id === sale.productId);
        if (!product)
            return acc;
        const income = product.price * sale.quantity;
        const investment = product.cost * sale.quantity;
        acc.unitsSold += sale.quantity;
        acc.income += income;
        acc.investment += investment;
        acc.profit += income - investment;
        acc.byProduct[product.name] = (acc.byProduct[product.name] ?? 0) + sale.quantity;
        return acc;
    }, { unitsSold: 0, income: 0, investment: 0, profit: 0, byProduct: {} });
    res.json(summary);
});
app.post('/whatsapp/qr-alert', upload.single('voucher'), (req, res) => {
    const { table, saleId, amount } = req.body;
    res.json({
        status: 'ready_to_send',
        whatsappText: `Miami Space QR pendiente. Mesa: ${table ?? 'N/A'}. Venta: ${saleId ?? 'N/A'}. Monto: ${amount ?? 'N/A'}.`,
        voucherUrl: req.file?.path,
    });
});
app.use((error, _req, res, _next) => {
    if (error instanceof z.ZodError)
        return res.status(400).json({ message: 'Invalid payload', issues: error.issues });
    console.error(error);
    return res.status(500).json({ message: 'Internal server error' });
});
app.listen(port, () => {
    console.log(`Miami Space backend running on http://localhost:${port}`);
});
function coerceBody(body) {
    return Object.fromEntries(Object.entries(body).map(([key, value]) => {
        const text = String(value);
        const numeric = Number(text);
        return [key, text.trim() !== '' && Number.isFinite(numeric) ? numeric : value];
    }));
}
