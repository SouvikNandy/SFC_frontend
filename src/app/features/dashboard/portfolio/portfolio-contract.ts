import { ContractRef } from './models/portfolio.model';
import { dateLabel } from './portfolio-ledger';

/** Builds the contract a fill is booked against; the key makes the same underlying/expiry/strike/type one position. */
export function makeContract(input: {
    underlying: string;
    kind: ContractRef['kind'];
    expiry: string;
    strike: number | null;
    optionType: ContractRef['optionType'];
    lot: number;
}): ContractRef {
    const expiry = dateLabel(input.expiry);
    if (input.kind === 'future') {
        return {
            key: `${input.underlying}|FUT|${input.expiry}`,
            label: `${input.underlying} FUT ${expiry}`,
            kind: 'future',
            underlying: input.underlying,
            expiry: input.expiry,
            strike: null,
            optionType: null,
            lot: input.lot,
        };
    }
    return {
        key: `${input.underlying}|OPT|${input.expiry}|${input.strike}|${input.optionType}`,
        label: `${input.underlying} ${input.strike} ${input.optionType} ${expiry}`,
        kind: 'option',
        underlying: input.underlying,
        expiry: input.expiry,
        strike: input.strike,
        optionType: input.optionType,
        lot: input.lot,
    };
}
