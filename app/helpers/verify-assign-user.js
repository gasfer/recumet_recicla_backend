const moment = require("moment");

/**
 * 
 * @param {*} user whit
 * "assign_shift": [
            {
                "id": 29,
                "number_day": 0,
                "day": "DOMINGO",
                "hour_start": "12:00",
                "hour_end": "19:59",
                "status": true
            },
            {
                "id": 30,
                "number_day": 1,
                "day": "LUNES",
                "hour_start": "00:00",
                "hour_end": "23:59",
                "status": true
            },
            {
                "id": 31,
                "number_day": 2,
                "day": "MARTES",
                "hour_start": "00:00",
                "hour_end": "23:59",
                "status": true
            },
            {
                "id": 32,
                "number_day": 3,
                "day": "MIERCOLES",
                "hour_start": "00:00",
                "hour_end": "23:59",
                "status": true
            },
            {
                "id": 33,
                "number_day": 4,
                "day": "JUEVES",
                "hour_start": "00:00",
                "hour_end": "23:59",
                "status": true
            },
            {
                "id": 34,
                "number_day": 5,
                "day": "VIERNES",
                "hour_start": "00:00",
                "hour_end": "23:59",
                "status": true
            },
            {
                "id": 35,
                "number_day": 6,
                "day": "SABADO",
                "hour_start": "00:00",
                "hour_end": "00:00",
                "status": true
            }
        ],
 * @returns boolean
 */
const verifyAssignShift = (assign_shift) => {
    //**Validate day and hour login */
    const numberDay = moment().day();
    const nowHour = moment();
    let exitShiftAssign = assign_shift.filter((resp) => resp.status == true)
                                        .find(resp => resp.number_day === numberDay);
    if(!exitShiftAssign) return false;
    const hour_start = moment(exitShiftAssign.hour_start, 'HH:mm');
    const hour_end = moment(exitShiftAssign.hour_end, 'HH:mm');
    if (!nowHour.isBetween(hour_start, hour_end)) {
        return false
    }
    return true;
}

module.exports = {
    verifyAssignShift
}