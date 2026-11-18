package org.example.yci_web.Service.Implement;

import org.example.yci_web.Entity.*;
import org.example.yci_web.Model.DTO.*;
import org.example.yci_web.Model.Request.AcceptBookingRequest;
import org.example.yci_web.Model.Request.BookingRequest;
import org.example.yci_web.Model.Request.CompleteBookingRequest;
import org.example.yci_web.Model.Request.UpdateStatusBookingRequest;
import org.example.yci_web.Model.Response.DataResponse;
import org.example.yci_web.Model.Response.MessageResponse;
import org.example.yci_web.Repository.*;
import org.example.yci_web.Service.BookingService;
import org.modelmapper.ModelMapper;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.NoSuchElementException;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Service
public class BookingServiceImpl implements BookingService {
    @Autowired
    UserRepository userRepository;
    @Autowired
    ProductRepository productRepository;
    @Autowired
    BookingRepository bookingRepository;
    @Autowired
    RentalPriceRepository rentalPriceRepository;
    @Autowired
    StatusRepository statusRepository;
    @Autowired
    RentalTypeRepository rentalTypeRepository;
    @Autowired
    org.example.yci_web.Service.NotificationService notificationService;
    @Autowired
    PaymentsMethodRepository paymentsMethodRepository;
    @Autowired
    DepositTypeRepository depositTypeRepository;
    @Autowired
    PaymentBookingRepository paymentBookingRepository;
    @Autowired
    org.example.yci_web.Repository.ReturnDetailRepository returnDetailRepository;
    @Autowired
    ModelMapper modelMapper;

    @Override
    public MessageResponse Booking(BookingRequest bookingRequest) {
        MessageResponse messageResponse = new MessageResponse();
        UserEntity userEntity = null;
        BookingEntity bookingEntity = new BookingEntity();
        StatusEntity statusEntity = null;
        RentalTypeEntity rentalTypeEntity = null;
        List<BookingDetailEntity> bookingDetailEntities = new ArrayList<>();
        double totalAmount = 0;

        if (bookingRequest.getTimeStart() == null
                || bookingRequest.getTimeEnd() == null
                || !bookingRequest.getTimeEnd().isAfter(bookingRequest.getTimeStart())) {
            messageResponse.setMessage("Thời gian thuê không hợp lệ");
            messageResponse.setStatus(HttpStatus.BAD_REQUEST);
            return messageResponse;
        }
        // Không cho phép chọn ngày bắt đầu trong quá khứ
        if (bookingRequest.getTimeStart().isBefore(LocalDateTime.now())) {
            messageResponse.setMessage("Ngày bắt đầu thuê không được ở trong quá khứ");
            messageResponse.setStatus(HttpStatus.BAD_REQUEST);
            return messageResponse;
        }
        if (bookingRequest.getProductIds() == null || bookingRequest.getProductIds().isEmpty()) {
            messageResponse.setMessage("Vui lòng chọn ít nhất một thiết bị");
            messageResponse.setStatus(HttpStatus.BAD_REQUEST);
            return messageResponse;
        }

        try {
            userEntity = userRepository.findById(bookingRequest.getUserId()).get();
        } catch (NoSuchElementException ex) {
            messageResponse.setMessage("Không tìm thấy khách hàng");
            messageResponse.setStatus(HttpStatus.NOT_FOUND);
            return messageResponse;
        }
        if (userEntity.getRole() != null && userEntity.getRole() == 0) {
            messageResponse.setMessage("Tài khoản quản trị chỉ được xem, không thể đặt thuê");
            messageResponse.setStatus(HttpStatus.FORBIDDEN);
            return messageResponse;
        }
        statusEntity = findOrCreateStatus("WAITING ACCEPT");
        try {
            rentalTypeEntity = rentalTypeRepository.findById(bookingRequest.getIdRentalType()).get();
        } catch (NoSuchElementException ex) {
            messageResponse.setMessage("Không tìm thấy loại giá thuê");
            messageResponse.setStatus(HttpStatus.NOT_FOUND);
            return messageResponse;
        }
        // Không validate thời lượng theo gói — booking theo ngày tùy chọn
        Set<Long> requestedProductIds = new LinkedHashSet<>(bookingRequest.getProductIds());
        for (BookingEntity booking : bookingRepository.findAll()) {
            if (isClosedStatus(booking.getStatusEntity())) {
                continue;
            }
            String existingStatus = booking.getStatusEntity() == null ? ""
                    : booking.getStatusEntity().getStatusCode();
            boolean isRenting = "RENTING".equalsIgnoreCase(existingStatus);

            // Nếu đơn đang RENTING, máy vẫn đang được khách cũ giữ (kể cả trả trễ)
            // → block mọi đặt thuê mới cho máy đó, bất kể thời gian
            if (isRenting) {
                for (BookingDetailEntity detail : booking.getBookingDetailEntities()) {
                    if (detail.getProductEntity() != null
                            && requestedProductIds.contains(detail.getProductEntity().getIdProduct())) {
                        messageResponse.setMessage("Thiết bị " + detail.getProductEntity().getNameProduct()
                                + " đang được thuê và chưa được trả. Vui lòng chờ thiết bị được trả lại trước khi đặt thuê mới");
                        messageResponse.setStatus(HttpStatus.BAD_REQUEST);
                        return messageResponse;
                    }
                }
                continue; // Đã kiểm tra RENTING, bỏ qua overlap check thông thường
            }

            // Với các đơn chờ xác nhận / đã xác nhận: kiểm tra overlap thời gian
            boolean overlap = bookingRequest.getTimeStart().isBefore(booking.getTimeEnd())
                    && bookingRequest.getTimeEnd().isAfter(booking.getTimeStart());
            if (!overlap) {
                continue;
            }
            for (BookingDetailEntity detail : booking.getBookingDetailEntities()) {
                if (detail.getProductEntity() != null
                        && requestedProductIds.contains(detail.getProductEntity().getIdProduct())) {
                    messageResponse.setMessage("Thiết bị " + detail.getProductEntity().getNameProduct() + " đã có lịch thuê trong khoảng thời gian này");
                    messageResponse.setStatus(HttpStatus.BAD_REQUEST);
                    return messageResponse;
                }
            }
        }

        bookingEntity.setTimeStart(bookingRequest.getTimeStart());
        bookingEntity.setTimeEnd(bookingRequest.getTimeEnd());
        bookingEntity.setNote(bookingRequest.getNote());
        bookingEntity.setUserEntity(userEntity);
        bookingEntity.setStatusEntity(statusEntity);
        bookingEntity.setCreatedAt(LocalDateTime.now());

        // Tính số đơn vị thuê (ngày hoặc giờ) từ khoảng thời gian
        long totalMinutes = Duration.between(bookingRequest.getTimeStart(), bookingRequest.getTimeEnd()).toMinutes();
        double rentalUnitHours = rentalDurationHours(rentalTypeEntity.getType());
        double units = (rentalUnitHours > 0) ? Math.ceil((totalMinutes / 60.0) / rentalUnitHours) : 1;
        if (units < 1) units = 1;

        // Kiểm tra xem có giá combo không
        boolean isCombo = bookingRequest.getComboPrice() != null && bookingRequest.getComboPrice() > 0;

        for (Long idProduct : requestedProductIds) {
            BookingDetailEntity bookingDetailEntity = new BookingDetailEntity();
            ProductEntity productEntity;
            try {
                productEntity = productRepository.findById(idProduct).get();
            } catch (NoSuchElementException ex) {
                messageResponse.setMessage("Không tìm thấy thiết bị");
                messageResponse.setStatus(HttpStatus.NOT_FOUND);
                return messageResponse;
            }

            double lineTotal;
            if (isCombo) {
                // Combo: ghi nhận 0 cho từng dòng, tổng sẽ set riêng
                lineTotal = 0;
            } else {
                RentalPriceEntity rentalPriceEntity = rentalPriceRepository.findByProductEntityAndRentalTypeEntity(productEntity, rentalTypeEntity);
                if (rentalPriceEntity == null) {
                    messageResponse.setMessage("Thiết bị " + productEntity.getNameProduct() + " chưa có giá thuê cho loại giá đã chọn");
                    messageResponse.setStatus(HttpStatus.BAD_REQUEST);
                    return messageResponse;
                }
                double unitPrice = rentalPriceEntity.getPrice() == null ? 0 : rentalPriceEntity.getPrice();
                lineTotal = unitPrice * units;
                totalAmount += lineTotal;
            }

            bookingDetailEntity.setBookingEntity(bookingEntity);
            bookingDetailEntity.setProductEntity(productEntity);
            bookingDetailEntity.setTotalPrice(lineTotal);
            bookingDetailEntities.add(bookingDetailEntity);
        }

        // Nếu đặt combo: totalAmount = comboPrice * số ngày
        if (isCombo) {
            totalAmount = bookingRequest.getComboPrice() * units;
        }

        bookingEntity.setTotalAmount(totalAmount);
        bookingEntity.setBookingDetailEntities(bookingDetailEntities);
        bookingRepository.save(bookingEntity);

        // Sinh mã đơn dạng HD000001 từ idBooking (gán sau khi DB trả về id)
        bookingEntity.setBookingCode("HD" + String.format("%06d", bookingEntity.getIdBooking()));
        bookingRepository.save(bookingEntity);

        // ── Thông báo ──────────────────────────────────────────
        // Khách: đặt thành công
        notificationService.push(userEntity.getIdUser(),
                "Đặt lịch thuê thành công 🎉",
                "Đơn thuê " + bookingEntity.getBookingCode() + " đã được gửi. Vui lòng chờ nhân viên xác nhận.",
                "SUCCESS", "/orders");
        // Admin & nhân viên: có đơn mới
        pushToStaff("Đơn thuê mới " + bookingEntity.getBookingCode(),
                "Khách hàng " + userEntity.getFullName() + " vừa gửi yêu cầu thuê. Cần xác nhận.",
                "INFO", "/admin/bookings");

        messageResponse.setMessage("Đặt lịch thuê thành công");
        messageResponse.setStatus(HttpStatus.OK);
        return messageResponse;
    }

    // ── Helper: map a single BookingEntity → BookingDTO (no document fields) ──
    private BookingDTO toBookingDTO(BookingEntity bookingEntity) {
        BookingDTO bookingDTO = new BookingDTO();
        modelMapper.map(bookingEntity, bookingDTO);
        bookingDTO.setStatus(bookingEntity.getStatusEntity() != null
                ? bookingEntity.getStatusEntity().getStatusCode() : "");
        // Đảm bảo bookingCode luôn có giá trị (backfill cho đơn cũ chưa có code)
        if (bookingEntity.getBookingCode() == null || bookingEntity.getBookingCode().isBlank()) {
            bookingDTO.setBookingCode("HD" + String.format("%06d", bookingEntity.getIdBooking()));
        }

        List<BookingDetailDTO> bookingDetailDTOS = new ArrayList<>();
        for (BookingDetailEntity bookingDetailEntity : bookingEntity.getBookingDetailEntities()) {
            BookingDetailDTO bookingDetailDTO = new BookingDetailDTO();
            modelMapper.map(bookingDetailEntity, bookingDetailDTO);

            ProductBookingDTO productBookingDTO = new ProductBookingDTO();
            if (bookingDetailEntity.getProductEntity() != null) {
                modelMapper.map(bookingDetailEntity.getProductEntity(), productBookingDTO);
            }
            productBookingDTO.setPrice(bookingDetailEntity.getTotalPrice());
            bookingDetailDTO.setProductBookingDTO(productBookingDTO);

            if (!bookingDetailEntity.getReturnDetailEntities().isEmpty()) {
                for (ReturnDetailEntity returnDetailEntity : bookingDetailEntity.getReturnDetailEntities()) {
                    ReturnDetailDTO returnDetailDTO = new ReturnDetailDTO();
                    modelMapper.map(returnDetailEntity, returnDetailDTO);
                    bookingDetailDTO.setReturnDetailDTO(returnDetailDTO);
                }
            }
            bookingDetailDTOS.add(bookingDetailDTO);
        }
        bookingDTO.setBookingDetailDTOS(bookingDetailDTOS);

        if (bookingEntity.getDepositTypeEntity() != null) {
            DepositTypeDTO depositTypeDTO = new DepositTypeDTO();
            modelMapper.map(bookingEntity.getDepositTypeEntity(), depositTypeDTO);
            bookingDTO.setDepositTypeDTO(depositTypeDTO);
        }

        UserBookingDTO userBookingDTO = new UserBookingDTO();
        if (bookingEntity.getUserEntity() != null) {
            modelMapper.map(bookingEntity.getUserEntity(), userBookingDTO);
        }
        bookingDTO.setUserBookingDTO(userBookingDTO);

        List<PaymentBookingDTO> paymentBookingDTOS = new ArrayList<>();
        for (PaymentBookingEntity paymentBookingEntity : bookingEntity.getPaymentBookingEntities()) {
            PaymentBookingDTO paymentBookingDTO = new PaymentBookingDTO();
            modelMapper.map(paymentBookingEntity, paymentBookingDTO);
            if (paymentBookingEntity.getPaymentsMethodEntity() != null) {
                paymentBookingDTO.setPaymentMethod(paymentBookingEntity.getPaymentsMethodEntity().getMethod());
            }
            paymentBookingDTOS.add(paymentBookingDTO);
        }
        bookingDTO.setPaymentBookingDTOS(paymentBookingDTOS);

        return bookingDTO;
    }

    @Override
    public Page<BookingDTO> getBookings(Integer page) {
        Pageable pageable = PageRequest.of(page - 1, 10);
        Page<BookingEntity> bookingEntities = bookingRepository.findAll(pageable);
        List<BookingDTO> bookingDTOS = new ArrayList<>();
        for (BookingEntity bookingEntity : bookingEntities) {
            bookingDTOS.add(toBookingDTO(bookingEntity));
        }
        return new PageImpl<>(bookingDTOS, bookingEntities.getPageable(), bookingEntities.getTotalElements());
    }

    @Override
    public MessageResponse acceptBooking(AcceptBookingRequest acceptBookingRequest) {
        MessageResponse messageResponse = new MessageResponse();
        try {
            BookingEntity bookingEntity = bookingRepository.findById(acceptBookingRequest.getBookingId()).get();
            try {
                StatusEntity statusEntity = statusRepository.findByStatusCode("ACCEPTED");
                try {
                    PaymentsMethodEntity paymentsMethodEntity = paymentsMethodRepository.findById(acceptBookingRequest.getPaymentMethodId()).get();
                    try {
                        DepositTypeEntity depositTypeEntity = depositTypeRepository.findById(acceptBookingRequest.getDepositTypeId()).get();
                        bookingEntity.setDepositTypeEntity(depositTypeEntity);
                        bookingEntity.setStatusEntity(statusEntity);

                        Double depositPrice = (depositTypeEntity.getPercentDeposit() * bookingEntity.getTotalAmount()) / 100;
                        PaymentBookingEntity paymentBookingEntity = new PaymentBookingEntity();
                        paymentBookingEntity.setPaymentsMethodEntity(paymentsMethodEntity);
                        paymentBookingEntity.setBookingEntity(bookingEntity);
                        paymentBookingEntity.setPaidAt(LocalDateTime.now());
                        paymentBookingEntity.setPrice(depositPrice);
                        paymentBookingEntity.setRemainAmount(bookingEntity.getTotalAmount() - depositPrice);
                        paymentBookingEntity.setNote("Tiền cọc (" + depositTypeEntity.getPercentDeposit().intValue() + "%)");
                        paymentBookingRepository.save(paymentBookingEntity);

                        bookingRepository.save(bookingEntity);

                        // ── Thông báo ──────────────────────────────────────────
                        Long customerId = bookingEntity.getUserEntity().getIdUser();
                        notificationService.push(customerId,
                                "Đơn thuê đã được xác nhận ✅",
                                "Đơn thuê #" + bookingEntity.getIdBooking() + " đã được xác nhận. Vui lòng đến nhận thiết bị đúng giờ.",
                                "SUCCESS", "/orders");

                        messageResponse.setMessage("Xác nhận đơn thuê thành công");
                        messageResponse.setStatus(HttpStatus.OK);
                        return messageResponse;
                    } catch (NoSuchElementException ex) {
                        messageResponse.setMessage("Không tìm thấy loại tiền cọc");
                        messageResponse.setStatus(HttpStatus.NOT_FOUND);
                        return messageResponse;
                    }
                } catch (NoSuchElementException ex) {
                    messageResponse.setMessage("Không tìm thấy phương thức thanh toán");
                    messageResponse.setStatus(HttpStatus.NOT_FOUND);
                    return messageResponse;
                }
            } catch (NoSuchElementException ex) {
                messageResponse.setStatus(HttpStatus.NOT_FOUND);
                messageResponse.setMessage("Không tìm thấy trạng thái đơn thuê");
                return messageResponse;
            }
        } catch (NoSuchElementException ex) {
            messageResponse.setStatus(HttpStatus.NOT_FOUND);
            messageResponse.setMessage("Không tìm thấy đơn thuê");
            return messageResponse;
        }
    }

    @Override
    public MessageResponse updateStatusBooking(UpdateStatusBookingRequest updateStatusBookingRequest) {
        MessageResponse messageResponse = new MessageResponse();
        try {
            BookingEntity bookingEntity = bookingRepository.findById(updateStatusBookingRequest.getBookingId()).get();
            try {
                StatusEntity statusEntity = statusRepository.findById(updateStatusBookingRequest.getStatusId()).get();
                bookingEntity.setStatusEntity(statusEntity);
                if (statusEntity.getStatusCode().equals("RENTING")) {
                    for (BookingDetailEntity bookingDetailEntity : bookingEntity.getBookingDetailEntities()) {
                        StatusEntity statusProduct = statusRepository.findByStatusCode("RENTED");
                        bookingDetailEntity.getProductEntity().setStatusEntity(statusProduct);
                    }
                }
                bookingRepository.save(bookingEntity);
                messageResponse.setMessage("Cập nhật trạng thái đơn thuê thành công");
                messageResponse.setStatus(HttpStatus.OK);
                return messageResponse;
            } catch (NoSuchElementException ex) {
                messageResponse.setMessage("Không tìm thấy trạng thái đơn thuê");
                messageResponse.setStatus(HttpStatus.NOT_FOUND);
                return messageResponse;
            }
        } catch (NoSuchElementException ex) {
            messageResponse.setStatus(HttpStatus.NOT_FOUND);
            messageResponse.setMessage("Không tìm thấy đơn thuê");
            return messageResponse;
        }
    }

    @Override
    public MessageResponse cancelBooking(Long idBooking, Long idUser) {
        MessageResponse messageResponse = new MessageResponse();
        try {
            BookingEntity bookingEntity = bookingRepository.findById(idBooking).get();
            if (idUser != null
                    && bookingEntity.getUserEntity() != null
                    && !bookingEntity.getUserEntity().getIdUser().equals(idUser)) {
                messageResponse.setMessage("Bạn không có quyền hủy đơn thuê này");
                messageResponse.setStatus(HttpStatus.FORBIDDEN);
                return messageResponse;
            }
            String statusCode = bookingEntity.getStatusEntity() == null ? "" : bookingEntity.getStatusEntity().getStatusCode();
            if (!isWaitingStatus(statusCode)) {
                messageResponse.setMessage("Chỉ được hủy đơn khi đơn còn chờ xác nhận");
                messageResponse.setStatus(HttpStatus.BAD_REQUEST);
                return messageResponse;
            }
            bookingEntity.setStatusEntity(findOrCreateStatus("CANCELLED"));
            bookingRepository.save(bookingEntity);
            messageResponse.setMessage("Đã hủy đơn thuê");
            messageResponse.setStatus(HttpStatus.OK);
            return messageResponse;
        } catch (NoSuchElementException ex) {
            messageResponse.setMessage("Không tìm thấy đơn thuê");
            messageResponse.setStatus(HttpStatus.NOT_FOUND);
            return messageResponse;
        }
    }

    @Override
    public MessageResponse completeBooking(CompleteBookingRequest request) {
        MessageResponse response = new MessageResponse();
        try {
            BookingEntity booking = bookingRepository.findById(request.getBookingId())
                    .orElseThrow(() -> new NoSuchElementException("Không tìm thấy đơn thuê"));

            String currentStatus = booking.getStatusEntity() == null ? ""
                    : booking.getStatusEntity().getStatusCode();
            if (!currentStatus.equals("RENTING")) {
                response.setMessage("Chỉ có thể hoàn tất đơn đang ở trạng thái RENTING");
                response.setStatus(HttpStatus.BAD_REQUEST);
                return response;
            }

            int lateHours = request.getLateHours() == null ? 0 : request.getLateHours();
            double feePerHour = request.getLateFeePerHour() == null ? 0.0 : request.getLateFeePerHour();
            double cleaningFee = request.getCleaningFee() == null ? 0.0 : request.getCleaningFee();
            double damageFee = request.getDamageFee() == null ? 0.0 : request.getDamageFee();
            double lateFee = lateHours * feePerHour;
            double subtotal = lateFee + cleaningFee + damageFee;

            // Ghi ReturnDetail cho từng thiết bị + giải phóng sản phẩm
            StatusEntity availableStatus = findOrCreateStatus("AVAILABLE");
            for (BookingDetailEntity detail : booking.getBookingDetailEntities()) {
                ReturnDetailEntity rd = new ReturnDetailEntity();
                rd.setBookingDetailEntity(detail);
                rd.setReturnedQuantity(1);
                rd.setLateHours(lateHours);
                rd.setLateFee(lateFee);
                rd.setCleaningFee(cleaningFee);
                rd.setDamageFee(damageFee);
                rd.setSubtotalFee(subtotal);
                rd.setDescription(request.getDescription());
                returnDetailRepository.save(rd);
                // Giải phóng sản phẩm
                detail.getProductEntity().setStatusEntity(availableStatus);
            }

            // Tạo payment record cho phụ phí nếu có
            if (subtotal > 0) {
                String methodName = "transfer".equalsIgnoreCase(request.getPaymentMethod())
                        ? "Chuyển khoản" : "Tiền mặt";
                PaymentsMethodEntity method = paymentsMethodRepository.findAll().stream()
                        .filter(m -> m.getMethod() != null
                                && m.getMethod().toLowerCase().contains(
                                        "transfer".equalsIgnoreCase(request.getPaymentMethod()) ? "khoản" : "mặt"))
                        .findFirst()
                        .orElseGet(() -> {
                            PaymentsMethodEntity m = new PaymentsMethodEntity();
                            m.setMethod(methodName);
                            return paymentsMethodRepository.save(m);
                        });
                PaymentBookingEntity extraPayment = new PaymentBookingEntity();
                extraPayment.setBookingEntity(booking);
                extraPayment.setPaymentsMethodEntity(method);
                extraPayment.setPrice(subtotal);
                extraPayment.setRemainAmount(0.0);
                extraPayment.setPaidAt(LocalDateTime.now());
                extraPayment.setPaymentStatus("PAID");
                // Ghi nhãn chi tiết phụ thu
                List<String> parts = new ArrayList<>();
                if (lateHours > 0) parts.add("trả trễ " + lateHours + "h");
                if (cleaningFee > 0) parts.add("vệ sinh");
                if (damageFee > 0) parts.add("hư hỏng");
                extraPayment.setNote("Phụ thu: " + String.join(", ", parts));
                paymentBookingRepository.save(extraPayment);
            }

            // Chuyển đơn → COMPLETED
            booking.setStatusEntity(findOrCreateStatus("COMPLETED"));
            bookingRepository.save(booking);

            // Thông báo khách
            String displayCode = booking.getBookingCode() != null ? booking.getBookingCode() : ("#" + booking.getIdBooking());
            String msg = "Đơn thuê " + displayCode + " đã hoàn tất.";
            if (lateHours > 0) {
                msg += " Phụ phí trễ " + lateHours + " giờ: " + String.format("%,.0f", lateFee) + " đ.";
            }
            if (cleaningFee > 0 || damageFee > 0) {
                msg += " Phí phát sinh thêm: " + String.format("%,.0f", cleaningFee + damageFee) + " đ.";
            }
            notificationService.push(booking.getUserEntity().getIdUser(),
                    "Đơn thuê đã hoàn tất ✅", msg, "SUCCESS", "/orders");

            response.setMessage("Hoàn tất đơn thuê thành công");
            response.setStatus(HttpStatus.OK);
        } catch (NoSuchElementException ex) {
            response.setMessage(ex.getMessage());
            response.setStatus(HttpStatus.NOT_FOUND);
        }
        return response;
    }

    @Override
    public Object getBookingsByUser(Long idUser) {
        MessageResponse messageResponse = new MessageResponse();
        DataResponse dataResponse = new DataResponse();
        List<BookingDTO> bookingDTOS = new ArrayList<>();
        UserEntity userEntity = null;
        try {
            userEntity = userRepository.findById(idUser).get();
        } catch (NoSuchElementException ex) {
            messageResponse.setStatus(HttpStatus.NOT_FOUND);
            messageResponse.setMessage("Không tìm thấy khách hàng");
            return messageResponse;
        }
        List<BookingEntity> bookingEntities = bookingRepository.findByUserEntity(userEntity);
        for (BookingEntity bookingEntity : bookingEntities) {
            bookingDTOS.add(toBookingDTO(bookingEntity));
        }
        dataResponse.setStatus(HttpStatus.OK);
        dataResponse.setData(bookingDTOS);
        dataResponse.setMessage("Thành công");
        return dataResponse;
    }

    @Override
    public Object getBookingById(Long idBooking) {
        MessageResponse messageResponse = new MessageResponse();
        DataResponse dataResponse = new DataResponse();
        try {
            BookingEntity bookingEntity = bookingRepository.findById(idBooking).get();
            dataResponse.setStatus(HttpStatus.OK);
            dataResponse.setData(toBookingDTO(bookingEntity));
            dataResponse.setMessage("Thành công");
            return dataResponse;
        } catch (NoSuchElementException ex) {
            messageResponse.setStatus(HttpStatus.NOT_FOUND);
            messageResponse.setMessage("Không tìm thấy đơn thuê");
            return messageResponse;
        }
    }

    // ── Push notification cho toàn bộ admin và nhân viên ──────
    private void pushToStaff(String title, String message, String type, String link) {
        userRepository.findByRole(0).forEach(u ->
                notificationService.push(u.getIdUser(), title, message, type, link));
        userRepository.findByRole(2).forEach(u ->
                notificationService.push(u.getIdUser(), title, message, type, link));
    }

    private StatusEntity findOrCreateStatus(String statusCode) {
        StatusEntity statusEntity = statusRepository.findByStatusCode(statusCode);
        if (statusEntity != null) {
            return statusEntity;
        }
        statusEntity = new StatusEntity();
        statusEntity.setStatusCode(statusCode);
        return statusRepository.save(statusEntity);
    }

    private boolean isClosedStatus(StatusEntity statusEntity) {
        String statusCode = statusEntity == null ? "" : statusEntity.getStatusCode();
        String normalized = statusCode == null ? "" : statusCode.trim().toUpperCase();
        return normalized.contains("CANCEL") || normalized.contains("RETURNED") || normalized.contains("COMPLETED");
    }

    private boolean isWaitingStatus(String statusCode) {
        String normalized = statusCode == null ? "" : statusCode.trim().toUpperCase();
        return normalized.equals("WAITING ACCEPT")
                || normalized.equals("WAITING_ACCEPT")
                || normalized.equals("PENDING")
                || normalized.equals("CHỜ XÁC NHẬN");
    }

    private double rentalDurationHours(String type) {
        String normalized = type == null ? "" : type.trim().toUpperCase(Locale.ROOT).replace(",", ".");
        Matcher hourMatcher = Pattern.compile("(\\d+(?:\\.\\d+)?)\\s*(H|GIỜ|GIO|HOUR)").matcher(normalized);
        if (hourMatcher.find()) {
            return Double.parseDouble(hourMatcher.group(1));
        }
        Matcher dayMatcher = Pattern.compile("(\\d+(?:\\.\\d+)?)\\s*(D|DAY|NGÀY|NGAY)").matcher(normalized);
        if (dayMatcher.find()) {
            return Double.parseDouble(dayMatcher.group(1)) * 24;
        }
        return 0;
    }
}
