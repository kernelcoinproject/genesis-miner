use core::ptr;
use core::slice;
use scrypt::{scrypt, Params};

const HEADER_LEN: usize = 80;
const HASH_LEN: usize = 32;
const RESULT_LEN: usize = 36;

static mut HEADER: [u8; HEADER_LEN] = [0; HEADER_LEN];
static mut TARGET: [u8; HASH_LEN] = [0; HASH_LEN];
static mut RESULT: [u8; RESULT_LEN] = [0; RESULT_LEN];

#[unsafe(no_mangle)]
pub extern "C" fn miner_header_ptr() -> *mut u8 {
    ptr::addr_of_mut!(HEADER).cast::<u8>()
}

#[unsafe(no_mangle)]
pub extern "C" fn miner_target_ptr() -> *mut u8 {
    ptr::addr_of_mut!(TARGET).cast::<u8>()
}

#[unsafe(no_mangle)]
pub extern "C" fn miner_result_ptr() -> *mut u8 {
    ptr::addr_of_mut!(RESULT).cast::<u8>()
}

/// Hash a nonce range using Bitcoin-style scrypt parameters (1024, 1, 1, 32).
/// Returns the number of hashes checked on a hit, or zero when no nonce meets
/// the target. The result buffer contains a little-endian nonce followed by the
/// byte-reversed scrypt hash, matching the miner's existing target comparison.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn miner_scrypt_batch(
    header_ptr: *mut u8,
    target_ptr: *const u8,
    start_nonce: u32,
    count: u32,
    stride: u32,
    result_ptr: *mut u8,
) -> u32 {
    if header_ptr.is_null() || target_ptr.is_null() || result_ptr.is_null() {
        return 0;
    }

    let header = unsafe { slice::from_raw_parts_mut(header_ptr, HEADER_LEN) };
    let target = unsafe { slice::from_raw_parts(target_ptr, HASH_LEN) };
    let result = unsafe { slice::from_raw_parts_mut(result_ptr, RESULT_LEN) };
    let params = match Params::new(10, 1, 1, HASH_LEN) {
        Ok(params) => params,
        Err(_) => return 0,
    };
    let mut hash = [0u8; HASH_LEN];
    let stride = stride.max(1);

    for offset in 0..count {
        let nonce = start_nonce.wrapping_add(offset.wrapping_mul(stride));
        header[76] = nonce as u8;
        header[77] = (nonce >> 8) as u8;
        header[78] = (nonce >> 16) as u8;
        header[79] = (nonce >> 24) as u8;

        if scrypt(header, header, &params, &mut hash).is_err() {
            return 0;
        }

        let mut below_target = false;
        for index in 0..HASH_LEN {
            let hash_byte = hash[HASH_LEN - 1 - index];
            if hash_byte < target[index] {
                below_target = true;
                break;
            }
            if hash_byte > target[index] {
                break;
            }
        }

        if below_target {
            result[0..4].copy_from_slice(&nonce.to_le_bytes());
            for index in 0..HASH_LEN {
                result[4 + index] = hash[HASH_LEN - 1 - index];
            }
            return offset + 1;
        }
    }

    0
}
