// * generated-by: @solderlab/bsc (rust)
// * board: ethersweep
// * source-revision: 67f2547e582de59cb77d4b3c2a25c8a6326ed864
// * bsc-schema-version: 1.0
// * source-sha256: 5789253170e0a85498799caa7342eb537daa990b6b654e4b2fa8d2b06d109cda
// * DO NOT EDIT

//! Board Support Contract — ethersweep
#![allow(non_upper_case_globals)]

pub const SOLDERLAB_BSC_VERSION: &str = "1.0";
pub const BOARD_NAME: &str = "ethersweep";

pub mod mcu {
    pub const REFDES: &str = "U3";
    pub const MPN: &str = "STM32F103C8Tx";
}

pub mod pins {
    /// U3 pad 1 → Net-(U3-Pad1)
    pub const VBAT: u16 = 1;
    /// U3 pad 2 → MOT_ENABLE
    pub const PC13_TAMPER_RTC: u16 = 2;
    /// U3 pad 3 → SDA
    pub const PC14_OSC32_IN: u16 = 3;
    /// U3 pad 4 → SCL
    pub const PC15_OSC32_OUT: u16 = 4;
    /// U3 pad 5 → MOT_UART_TX
    pub const PD0_OSC_IN: u16 = 5;
    /// U3 pad 6 → MOT_UART_RX
    pub const PD0_OSC_OUT: u16 = 6;
    /// U3 pad 7 → MOT_STEP
    pub const NRST: u16 = 7;
    /// U3 pad 8 → Net-(#PWR0101-Pad1)
    pub const VSSA: u16 = 8;
    /// U3 pad 9 → Net-(U3-Pad9)
    pub const VDDA: u16 = 9;
    /// U3 pad 10 → ESTOP
    pub const PA0_WKUP: u16 = 10;
    /// U3 pad 11 → ENDSTOP
    pub const PA1: u16 = 11;
    /// U3 pad 12 → Net-(U3-Pad12)
    pub const PA2: u16 = 12;
    /// U3 pad 13 → RST_ETHERNET
    pub const PA3: u16 = 13;
    /// U3 pad 14 → Net-(U3-Pad14)
    pub const PA4: u16 = 14;
    /// U3 pad 15 → Net-(U3-Pad15)
    pub const PA5: u16 = 15;
    /// U3 pad 16 → Net-(U3-Pad16)
    pub const PA6: u16 = 16;
    /// U3 pad 17 → Net-(U3-Pad17)
    pub const PA7: u16 = 17;
    /// U3 pad 18 → MOT_M0
    pub const PB0: u16 = 18;
    /// U3 pad 19 → MOT_M1
    pub const PB1: u16 = 19;
    /// U3 pad 20 → BOOT_1
    pub const PB2: u16 = 20;
    /// U3 pad 21 → Net-(Y3-Pad1)
    pub const PB10: u16 = 21;
    /// U3 pad 22 → Net-(Y3-Pad2)
    pub const PB11: u16 = 22;
    /// U3 pad 23 → Net-(U3-Pad23)
    pub const VSS: u16 = 23;
    /// U3 pad 24 → Net-(U3-Pad1)
    pub const VDD: u16 = 24;
    /// U3 pad 25 → Net-(U3-Pad25)
    pub const PB12: u16 = 25;
    /// U3 pad 26 → BOOT_0
    pub const PB13: u16 = 26;
    /// U3 pad 27 → Net-(U3-Pad27)
    pub const PB14: u16 = 27;
    /// U3 pad 28 → rst
    pub const PB15: u16 = 28;
    /// U3 pad 29 → Net-(U3-Pad29)
    pub const PA8: u16 = 29;
    /// U3 pad 30 → Net-(U3-Pad30)
    pub const PA9: u16 = 30;
    /// U3 pad 31 → Net-(U3-Pad31)
    pub const PA10: u16 = 31;
    /// U3 pad 32 → Net-(U3-Pad32)
    pub const PA11: u16 = 32;
    /// U3 pad 33 → Net-(U3-Pad33)
    pub const PA12: u16 = 33;
    /// U3 pad 34 → Net-(U3-Pad34)
    pub const PA13: u16 = 34;
    /// U3 pad 35 → Net-(#PWR0101-Pad1)
    pub const VSS_35: u16 = 35;
    /// U3 pad 36 → Net-(U3-Pad1)
    pub const VDD_36: u16 = 36;
    /// U3 pad 37 → Net-(U3-Pad37)
    pub const PA14: u16 = 37;
    /// U3 pad 38 → Net-(U3-Pad38)
    pub const PA15: u16 = 38;
    /// U3 pad 39 → voltage_detect
    pub const PB3: u16 = 39;
    /// U3 pad 40 → ETH_INT
    pub const PB4: u16 = 40;
    /// U3 pad 41 → Net-(U3-Pad41)
    pub const PB5: u16 = 41;
    /// U3 pad 42 → Net-(U3-Pad42)
    pub const PB6: u16 = 42;
    /// U3 pad 43 → Net-(U3-Pad43)
    pub const PB7: u16 = 43;
    /// U3 pad 44 → Net-(U3-Pad44)
    pub const BOOT0: u16 = 44;
    /// U3 pad 45 → Net-(R15-Pad2)
    pub const PB8: u16 = 45;
    /// U3 pad 46 → Net-(U3-Pad46)
    pub const PB9: u16 = 46;
    /// U3 pad 47 → Net-(#PWR0101-Pad1)
    pub const VSS_47: u16 = 47;
    /// U3 pad 48 → Net-(U3-Pad1)
    pub const VDD_48: u16 = 48;
}

pub mod rails {
}

pub mod i2c {
}
