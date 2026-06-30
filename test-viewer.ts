import { loadEdinetOrders } from './lib/viewer-api';

async function testViewer() {
    const tickers = ['1952', '1969', '6266', '5631', '6981', '7011', '6323', '2590'];
    let success = true;
    for (const ticker of tickers) {
        console.log('Fetching EDINET orders for ticker ' + ticker + '...');
        try {
            const data = await loadEdinetOrders(ticker);
            console.log('  Got ' + data.length + ' records.');
            if (data.length > 0) {
                console.log('  Sample: period=' + data[0].period + ', orders_received=' + data[0].orders_received);
            }
        } catch (e) {
            console.error('  Error fetching ' + ticker + ':', e);
            success = false;
        }
    }
    process.exit(success ? 0 : 1);
}

testViewer();
