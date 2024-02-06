// Orderbook.tsx
import React, { useEffect, useRef, useState } from 'react';
import { getEthPrice, orderbookContract } from '../../contracts';
import { ethers } from "ethers";
import "../../asserts/scss/custom.scss";
import {Box, Card, CardContent, CircularProgress, Slider } from '@mui/material';
import { useTake } from '../../hooks/useTake';
import { useBorrow } from '../../hooks/useBorrow';
import { useChangePriceFeed } from '../../hooks/useChangePriceFeed';
import { useOrderContext } from './OrderContext';

interface OrderbookProps {
    isDeposit: boolean;
}

interface Order {
    id: number;
    limitPrice: string;
    size: string;
    isBorrowable: boolean;
}

const Orderbook = ({ isDeposit }: OrderbookProps) => {
    const PAGE_SIZE = 10;

    const [buyOrders, setBuyOrders] = useState<Order[]>([]);
    const [sellOrders, setSellOrders] = useState<Order[]>([]);

    // VARIABLES
    const [ethPrice, setEthPrice] = useState<string>("0");
    const [size, setSize] = useState<string | null>(null);
    const [limit, setLimit] = useState<string | null>(null);
    const [isEditing, setIsEditing] = useState<boolean>(false);
    const [newEthPrice, setNewEthPrice] = useState<string>(ethPrice);

    // SELECT ORDER
    const [selectedOrderId, setSelectedOrderId] = useState<number | null>(null);
    const { setOrderId, setLimitPrice, setAmount } = useOrderContext();

    // HOOKS
    const take = useTake();
    const borrow = useBorrow();
    const changePrice = useChangePriceFeed();

    // LOADING
    const [showProgress, setShowProgress] = useState(true);

    const [numVisibleOrders, setNumVisibleOrders] = useState<number>(10);

    const fetchEthPrice = async () => {
        const price = await getEthPrice();
        if (price) setEthPrice(String(price));
    };

    const handleAction = async (orderId: number, size: string) => {
        if (isDeposit) {
            await take(orderId, size);
        } else {
            await borrow(orderId, size);
        }
    };


    const handleRowClick = (orderId: number, limitPrice: string) => {
        setSelectedOrderId(orderId);
        setSize(size);
        setLimit(limitPrice);
        setOrderId(orderId);
        setLimitPrice(limitPrice);
        setAmount(size);
    };

    const handleEthPriceChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
        setNewEthPrice(event.target.value);
    };

    const handleEditClick = () => {
        setIsEditing(true);
    };

    const handleOkClick = () => {
        setShowProgress(true);
        setEthPrice(newEthPrice);
        setIsEditing(false);
        changePrice(newEthPrice);

        setTimeout(() => {
            setShowProgress(false);
        }, 10000);
    };

    const fetchOrders = async () => {
        try {

            const lastOrderId = await orderbookContract.lastOrderId();
            const numPages = Math.ceil(lastOrderId / PAGE_SIZE);
            const ethPriceInEther = ethPrice;
            const ethPriceNumber = ethPriceInEther ? parseFloat(String(ethPriceInEther)) : 0;

            const fetchPromises = Array.from({ length: numPages }, async (_, pageIndex) => {
                const startId = pageIndex * PAGE_SIZE + 1;
                const endId = Math.min(startId + PAGE_SIZE - 1, lastOrderId);

                let fetchedBuyOrders: Order[] = [];
                let fetchedSellOrders: Order[] = [];

                for (let i = startId; i <= endId; i++) {
                    const order = await orderbookContract.orders(i);

                    const orderFormatted = {
                        id: i,
                        limitPrice: ethers.utils.formatUnits(order.price, 'ether'),
                        size: ethers.utils.formatUnits(order.quantity, 'ether'),
                        isBorrowable: order.isBorrowable
                    };

                    const orderPriceNumber = parseFloat(orderFormatted.limitPrice);

                    // Ajoutez une condition pour filtrer les commandes ayant une taille supérieure à zéro
                    if (parseFloat(orderFormatted.size) > 0) {
                        if ((isDeposit && order.isBuyOrder && orderPriceNumber < ethPriceNumber) ||
                            (!isDeposit && !order.isBuyOrder && orderPriceNumber > ethPriceNumber)) {
                            fetchedBuyOrders.push(orderFormatted);
                        } else if ((isDeposit && !order.isBuyOrder && orderPriceNumber > ethPriceNumber) ||
                            (!isDeposit && order.isBuyOrder && orderPriceNumber < ethPriceNumber)) {
                            fetchedSellOrders.push(orderFormatted);
                        }
                    }
                }

                return { fetchedBuyOrders, fetchedSellOrders };
            });

            const results = await Promise.all(fetchPromises);

            const allBuyOrders = results.flatMap(result => result.fetchedBuyOrders);
            const allSellOrders = results.flatMap(result => result.fetchedSellOrders);

            setBuyOrders(allBuyOrders.sort((a, b) => parseFloat(b.limitPrice) - parseFloat(a.limitPrice)));
            setSellOrders(allSellOrders.sort((a, b) => parseFloat(b.limitPrice) - parseFloat(a.limitPrice)));

            setShowProgress(false);
        } catch (error) {
            console.error("Erreur : ", error);
            setShowProgress(false);
        }
    };


    useEffect(() => {
        fetchOrders();
    }, [buyOrders, sellOrders]);

    useEffect(() => {
        fetchEthPrice();
    }, []);


    return (
        <Card sx={{ maxWidth: '1300px', margin: 'auto', background: 'transparent', boxShadow: 'none',
            border: 'none' }}>
            <CardContent
                sx={{
                    width: '100%',
                    p: '1.5rem 2rem 1.5rem 2rem',
                    mb: '2rem',
                }}
            >
           <Box>
                    <table className="orderbook-table rounded-lg border-[5px] border-solid border-[#191b1f] ">
                        <thead>
                        <tr>
                            <th>Price (USDC)</th>
                            <th>Amount (ETH)</th>
                            <th>Utilization rate</th>
                            <th>Apy</th>
                            <th>Action</th>
                        </tr>
                        </thead>
                        <tbody>
                        {sellOrders.slice(0, numVisibleOrders).map(order => (
                            <tr key={order.id}
                                className={`sell-row ${selectedOrderId === order.id ? 'selected-row' : ''}`}
                                onClick={() => handleRowClick(order.id, order.limitPrice)}
                                style={{ height: '50px' }}>
                                <td>{Number(order.limitPrice).toFixed(2)}</td>
                                <td>{Number(order.size).toFixed(2)}</td>
                                <td className="text-white">44%</td>
                                <td className="text-white">9%</td>
                                <td>
                                    <button className={isDeposit ? "buy-button" : "sell-button"} onClick={() => handleAction(order.id, order.size)}>
                                        {isDeposit ? "TAKE" : "BORROW"}
                                    </button>
                                </td>
                            </tr>
                        ))}
                        <tr className="eth-price-row">
                            <td colSpan={5}>
                                {isEditing ? (
                                    <>
                                        <input
                                            type="number"
                                            value={newEthPrice}
                                            onChange={handleEthPriceChange}
                                            style={{ backgroundColor: 'transparent', color: 'white', border: 'none', width: '100px' }}
                                        />
                                        <button onClick={handleOkClick}>OK</button>
                                    </>
                                ) : (
                                    <>
                                        ${ethPrice}
                                        <button onClick={handleEditClick} style={{ marginLeft: '10px' }}>
                                            Edit
                                        </button>
                                        {showProgress && <CircularProgress size={10} style={{ marginLeft: '10px'}} />}
                                    </>
                                )}
                            </td>
                        </tr>
                        {buyOrders.slice(0, numVisibleOrders).map(order => (
                            <tr key={order.id}
                                className={`buy-row ${selectedOrderId === order.id ? 'selected-row' : ''}`}
                                onClick={() => handleRowClick(order.id, order.limitPrice)}
                                style={{ height: '50px' }}>
                                <td>{Number(order.limitPrice).toFixed(2)}</td>
                                <td>{(Number(order.size)/Number(ethPrice)).toFixed(2)}</td>
                                <td className="text-white">56%</td>
                                <td className="text-white">{isDeposit ? '7%' : '-'}</td>
                                <td className="text-white">
                                    {!isDeposit ? '-' :
                                        <button className="sell-button opacity-30 pointer-events-none">
                                            TAKE
                                        </button>
                                    }
                                </td>
                            </tr>
                        ))}

                        </tbody>
                    </table>
           </Box>
        </CardContent>
      </Card>

    );
};

export default Orderbook;
